odoo.define('pos_mercado_pago.payment_qr', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');

    var _t = core._t;

    var PaymentMercadoPagoQR = PaymentInterface.extend({

        send_payment_request: function (cid) {
            this._super.apply(this, arguments);
            this._reset_state();
            return this._mercado_pago_qr_pay(cid);
        },
        send_payment_cancel: function (order, cid) {
            this._super.apply(this, arguments);
            return this._mercado_pago_qr_cancel();
        },
        close: function () {
            this._super.apply(this, arguments);
        },

        // set_most_recent_service_id(id) {
        //     this.most_recent_service_id = id;
        // },

        pending_mercado_pago_qr_line() {
          return this.pos.get_order().paymentlines.find(
            paymentLine => paymentLine.payment_method.use_payment_terminal === 'mercado_pago_qr' && (!paymentLine.is_done()));
        },

        // private methods
        _reset_state: function () {
            this.was_cancelled = false;
            this.remaining_polls = 30;
            clearTimeout(this.polling);
        },

        _handle_odoo_connection_failure: function (data) {
            // handle timeout
            var line = this.pending_mercado_pago_qr_line();

            if (line) {
                line.set_payment_status('retry');
            }
            this._show_error(_t('Could not connect to the Odoo server, please check your internet connection and try again.'));

            return Promise.reject(data); // prevent subsequent onFullFilled's from being called
        },

        _call_mercado_pago_qr: function (method ,info) {
            return rpc.query({
                model: 'pos.payment.method',
                method: method,
                args: [[this.payment_method.id], info],
            }, {
                // When a payment terminal is disconnected it takes Adyen
                // a while to return an error (~6s). So wait 10 seconds
                // before concluding Odoo is unreachable.
                timeout: 10000,
                shadow: true,
            }).catch(this._handle_odoo_connection_failure.bind(this));
        },

        _mercado_pago_qr_get_sale_id: function () {
            var config = this.pos.config;
            return _.str.sprintf('%s (ID: %s)', config.display_name, config.id);
        },

        _mercado_pago_qr_pay_data: function () {
            var order = this.pos.get_order();
            var config = this.pos.config;
            var line = order.selected_paymentline;
            var entropy = Math.floor(Math.random() * 100);
            line.external_reference = `${this.pos.pos_session.id}_${line.payment_method.id}_${entropy}`
            let base_url =  this.pos.base_url
            // base_url = 'https://hormigag.ar'
            var data = {
                title: order.name,
                notification_url: base_url + '/pos_mercado_pago/notification',
                description: this.pos.config.company_id[1],
                total_amount: line.amount,
                items: [{
                    sku_number: "0001",
                    category: "general",
                    title: this.pos.config.current_session_id[1] + "sale",
                    description: "odoo sale",
                    unit_price: line.amount,
                    quantity: 1,
                    unit_measure: "unit",
                    total_amount: line.amount.toFixed,
                }],
                external_reference: `${this.pos.pos_session.id}_${line.payment_method.id}_${entropy}`,
            };
            return data;
        },

        _mercado_pago_qr_pay: function (cid) {
            var self = this;
            var order = this.pos.get_order();

            if (order.selected_paymentline.amount < 0) {
                this._show_error(_t('Cannot process transactions with negative amount.'));
                return Promise.resolve();
            }

            if (order === this.poll_error_order) {
                delete this.poll_error_order;
                return self._mercado_pago_qr_handle_response({});
            }
            var data = this._mercado_pago_qr_pay_data();
            var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
            line.setTerminalServiceId(this.most_recent_service_id);
            return this._call_mercado_pago_qr('mp_payment_order_create', data).then(function (data) {
                if (data['status']== 400 || data['status']== 500){
                    self._show_error('No puedo crear la orden. ' + data['message']);
                }
                return self._mercado_pago_qr_handle_response(data);
            });
        },

        _mercado_pago_qr_cancel: function (ignore_error) {
            var self = this;
            var config = this.pos.config;
            var line = this.pending_mercado_pago_qr_line();
            return this._call_mercado_pago_qr('mp_payment_order_cancel',{}).then(function (data) {
                // Only valid response is a 200 OK HTTP response which is
                // represented by true.
                clearTimeout(self.polling);
                line.set_payment_status('retry');
                if (! ignore_error && data !== true) {
                    self._show_error(_t('Cancelling the payment failed.'));
                    return Promise.reject(data);
                }
                return Promise.resolve(data);
            });
        },

        _poll_for_response: function (resolve, reject) {
            self = this;
            if (this.was_cancelled) {
                resolve(false);
                return Promise.resolve();
            }
            var line = this.pending_mercado_pago_qr_line();;
            if (!line){
                this._reset_state()
            }
            return rpc.query({
                model: 'pos.payment.method',
                method: 'mp_payment_order_get',
                args: [[this.payment_method.id], line.external_reference],
            }, {
                timeout: 10000,
                shadow: true,
            }).catch(function (data) {
                if (self.remaining_polls != 0) {
                    line.set_payment_status('waitingCard');
                    self.remaining_polls--;
                } else {
                    reject();
                    self.poll_error_order = self.pos.get_order();
                    return self._mercado_pago_qr_cancel();
                }
                // This is to make sure that if 'data' is not an instance of Error (i.e. timeout error),
                // this promise don't resolve -- that is, it doesn't go to the 'then' clause.
                return Promise.reject(data);
            }).then(function (data) {
                //var notification = status.latest_response;
                var order = self.pos.get_order();
                var line = self.pending_mercado_pago_qr_line() || resolve(false);
                if (data['elements']){
                    data['elements'].forEach((merchand_order) => {
                        if (merchand_order['paid_amount'] > 0){
                            order.set_tip(0);
                            line.set_amount(merchand_order['paid_amount']);
                            line.set_payment_status('done');
                            line.transaction_id = merchand_order['id'];
                            clearTimeout(self.polling);
                            return Promise.resolve();
                        }
                    },order, line, self);
                }
            });
        },
        _mercado_pago_qr_handle_response: function (response) {
            var line = this.pending_mercado_pago_qr_line();
            if (!response) {
                this._show_error('No puedo crear la orden');
                line.set_payment_status('force_done');
                return Promise.resolve();
            }

            line.set_payment_status('waitingCard');
            return this.start_get_status_polling()

        },

        start_get_status_polling() {
            var self = this;
            var res = new Promise(function (resolve, reject) {
                // clear previous intervals just in case, otherwise
                // it'll run forever
                clearTimeout(self.polling);
                self._poll_for_response(resolve, reject);
                self.polling = setInterval(function () {
                    self._poll_for_response(resolve, reject);
                }, 5500);
            });

            // make sure to stop polling when we're done
            res.finally(function () {
                self._reset_state();
            });

            return res;
        },

        _show_error: function (msg, title) {
            if (!title) {
                title =  _t('Mercado pago Error');
            }
            Gui.showPopup('ErrorPopup',{
                'title': title,
                'body': msg,
            });
        },
    });

    return PaymentMercadoPagoQR;
    });




