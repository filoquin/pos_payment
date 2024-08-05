odoo.define('pos_mercado_pago.payment', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');

    var _t = core._t;

    var PaymentMercadoPago = PaymentInterface.extend({

        send_payment_request: function (cid) {
            this._super.apply(this, arguments);
            this._reset_state();
            return this._mercado_pago_pay(cid);
        },
        send_payment_cancel: function (order, cid) {
            this._super.apply(this, arguments);
            return this._mercado_pago_cancel();
        },
        close: function () {
            this._super.apply(this, arguments);
        },

        // set_most_recent_service_id(id) {
        //     this.most_recent_service_id = id;
        // },

        pending_mercado_pago_line() {
          return this.pos.get_order().paymentlines.find(
            paymentLine => paymentLine.payment_method.use_payment_terminal === 'mercado_pago' && (!paymentLine.is_done()));
        },

        // private methods
        _reset_state: function () {
            this.was_cancelled = false;
            this.remaining_polls = 30;
            clearTimeout(this.polling);
        },

        _handle_odoo_connection_failure: function (data) {
            // handle timeout
            var line = this.pending_mercado_pago_line();

            if (line) {
                line.set_payment_status('retry');
            }
            this._show_error(_t('Could not connect to the Odoo server, please check your internet connection and try again.'));

            return Promise.reject(data); // prevent subsequent onFullFilled's from being called
        },

        _call_mercado_pago: function (method ,info) {
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

        _mercado_pago_get_sale_id: function () {
            var config = this.pos.config;
            return _.str.sprintf('%s (ID: %s)', config.display_name, config.id);
        },

        _mercado_pago_pay_data: function () {
            var order = this.pos.get_order();
            var config = this.pos.config;
            var line = order.selected_paymentline;
            var entropy = Date.now() + Math.random();
            var data = {
                amount: parseInt(line.amount * 100, 10),
                additional_info: {
                    external_reference: `${this.pos.pos_session.id}_${line.payment_method.id}_${entropy}`,
                    print_on_terminal: true,
                    ticket_number: `${order.uid}_${order.paymentlines.length}`
                },
            };
            return data;
        },

        _mercado_pago_pay: function (cid) {
            var self = this;
            var order = this.pos.get_order();

            if (order.selected_paymentline.amount < 0) {
                this._show_error(_t('Cannot process transactions with negative amount.'));
                return Promise.resolve();
            }

            if (order === this.poll_error_order) {
                delete this.poll_error_order;
                return self._mercado_pago_handle_response({});
            }
            var data = this._mercado_pago_pay_data();
            var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
            line.setTerminalServiceId(this.most_recent_service_id);
            return this._call_mercado_pago('mp_payment_intent_create', data).then(function (data) {
                return self._mercado_pago_handle_response(data);
            });
        },

        _mercado_pago_cancel: function (ignore_error) {
            var self = this;
            var config = this.pos.config;
            var line = this.pending_mercado_pago_line();
            return this._call_mercado_pago('mp_payment_intent_cancel', line.intent_id).then(function (data) {
                // Only valid response is a 200 OK HTTP response which is
                // represented by true.
                clearTimeout(self.polling);
                line.set_payment_status('retry');
                if (! ignore_error && data !== true) {
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
            var line = this.pending_mercado_pago_line();;
            if (!line){
                clearTimeout(this.polling);
            }
            return rpc.query({
                model: 'pos.payment.method',
                method: 'mp_payment_intent_get',
                args: [[this.payment_method.id], line.intent_id],
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
                    return self._mercado_pago_cancel();
                }
                // This is to make sure that if 'data' is not an instance of Error (i.e. timeout error),
                // this promise don't resolve -- that is, it doesn't go to the 'then' clause.
                return Promise.reject(data);
            }).then(function (data) {
                //var notification = status.latest_response;
                var order = self.pos.get_order();
                var line = self.pending_mercado_pago_line() || resolve(false);
                if (data['state'] == 'FINISHED' || data['state'] == 'PROCESSED' ){
                    if (data['payment_info']['status'] ==  'approved'){
                        order.set_tip(0);
                        line.set_amount(data['amount'] / 100);
                        line.set_payment_status('done');
                        line.transaction_id = data['payment']['id'];
                        clearTimeout(self.polling);
                        return Promise.resolve();
                    } else if (data['payment_info']['status'] in ['rejected', 'cancelled']){
                        line.set_payment_status('RETRY');
                        reject();
                    }
                }
                if (data['state'] == 'CANCELED'){
                    line.set_payment_status('RETRY');
                    reject();
                }
            });
        },
        _mercado_pago_handle_response: function (response) {
            var line = this.pending_mercado_pago_line();
            if (response && !response['id']) {
                this._show_error(response['message']);
                line.set_payment_status('force_done');
                return Promise.resolve();
            }

            line.set_payment_status('waitingCard');
            line.intent_id = response['id']
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

    return PaymentMercadoPago;
    });





// /** @odoo-module */
// import { _t } from "@web/core/l10n/translation";
// import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
// import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";

// export class PaymentMercadoPago extends PaymentInterface {
//     async create_payment_intent() {
//         const line = this.pos.get_order().selected_paymentline;
//         // Build informations for creating a payment intend on Mercado Pago.
//         // Data in "external_reference" are send back with the webhook notification
//         const infos = {
//             amount: parseInt(line.amount * 100, 10),
//             additional_info: {
//                 external_reference: `${this.pos.pos_session.id}_${line.payment_method.id}`,
//                 print_on_terminal: true,
//             },
//         };
//         // mp_payment_intent_create will call the Mercado Pago api
//         return await this.env.services.orm.silent.call(
//             "pos.payment.method",
//             "mp_payment_intent_create",
//             [[line.payment_method.id], infos]
//         );
//     }
//     async get_last_status_payment_intent() {
//         const line = this.pos.get_order().selected_paymentline;
//         // mp_payment_intent_get will call the Mercado Pago api
//         return await this.env.services.orm.silent.call(
//             "pos.payment.method",
//             "mp_payment_intent_get",
//             [[line.payment_method.id], this.payment_intent.id]
//         );
//     }

//     async cancel_payment_intent() {
//         const line = this.pos.get_order().selected_paymentline;
//         // mp_payment_intent_cancel will call the Mercado Pago api
//         return await this.env.services.orm.silent.call(
//             "pos.payment.method",
//             "mp_payment_intent_cancel",
//             [[line.payment_method.id], this.payment_intent.id]
//         );
//     }
//     setup() {
//         super.setup(...arguments);
//         this.webhook_resolver = null;
//         this.payment_intent = {};
//     }

//     async send_payment_request(cid) {
//         await super.send_payment_request(...arguments);
//         const line = this.pos.get_order().selected_paymentline;
//         try {
//             // During payment creation, user can't cancel the payment intent
//             line.set_payment_status("waitingCapture");
//             // Call Mercado Pago to create a payment intent
//             const payment_intent = await this.create_payment_intent();
//             if (!("id" in payment_intent)) {
//                 this._showMsg(payment_intent.message, "error");
//                 return false;
//             }
//             // Payment intent creation successfull, save it
//             this.payment_intent = payment_intent;
//             // After payment creation, make the payment intent canceling possible
//             line.set_payment_status("waitingCard");
//             // Wait for payment intent status change and return status result
//             return await new Promise((resolve) => {
//                 this.webhook_resolver = resolve;
//             });
//         } catch (error) {
//             this._showMsg(error, "System error");
//             return false;
//         }
//     }

//     async send_payment_cancel(order, cid) {
//         await super.send_payment_cancel(order, cid);
//         if (!("id" in this.payment_intent)) {
//             return true;
//         }
//         const canceling_status = await this.cancel_payment_intent();
//         if ("error" in canceling_status) {
//             const message =
//                 canceling_status.status === 409
//                     ? _t("Payment has to be canceled on terminal")
//                     : _t("Payment not found (canceled/finished on terminal)");
//             this._showMsg(message, "info");
//             return canceling_status.status !== 409;
//         }
//         return true;
//     }

//     async handleMercadoPagoWebhook() {
//         const line = this.pos.get_order().selected_paymentline;
//         const MAX_RETRY = 5; // Maximum number of retries for the "ON_TERMINAL" BUG
//         const RETRY_DELAY = 1000; // Delay between retries in milliseconds for the "ON_TERMINAL" BUG
//         const showMessageAndResolve = (messageKey, status, resolverValue) => {
//             if (!resolverValue) {
//                 this._showMsg(messageKey, status);
//             }
//             line.set_payment_status("done");
//             this.webhook_resolver?.(resolverValue);
//             return resolverValue;
//         };
//         // No payment intent id means either that the user reload the page or
//         // it is an old webhook -> trash
//         if ("id" in this.payment_intent) {
//             // Call Mercado Pago to get the payment intent status
//             let last_status_payment_intent = await this.get_last_status_payment_intent();
//             // Bad payment intent id, then it's an old webhook not related with the
//             // current payment intent -> trash
//             if (this.payment_intent.id == last_status_payment_intent.id) {
//                 if (last_status_payment_intent.state === "CANCELED") {
//                     return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
//                 }
//                 if (["FINISHED", "PROCESSED"].includes(last_status_payment_intent.state)) {
//                     return showMessageAndResolve(_t("Payment has been finished"), "info", true);
//                 }
//                 // BUG Sometimes the Mercado Pago webhook return ON_TERMINAL
//                 // instead of CANCELED/FINISHED when we requested a payment status
//                 // that was actually canceled/finished by the user on the terminal.
//                 // Then the strategy here is to ask Mercado Pago MAX_RETRY times the
//                 // payment intent status, hoping going out of this status
//                 if (["OPEN", "ON_TERMINAL"].includes(last_status_payment_intent.state)) {
//                     return await new Promise((resolve) => {
//                         let retry_cnt = 0;
//                         const s = setInterval(async () => {
//                             last_status_payment_intent =
//                                 await this.get_last_status_payment_intent();
//                             if (
//                                 ["FINISHED", "PROCESSED", "CANCELED"].includes(
//                                     last_status_payment_intent.state
//                                 )
//                             ) {
//                                 clearInterval(s);
//                                 const payment_ok = ["FINISHED", "PROCESSED"].includes(
//                                     last_status_payment_intent.state
//                                 );
//                                 resolve(
//                                     showMessageAndResolve(
//                                         payment_ok
//                                             ? _t("Payment has been finished")
//                                             : _t("Payment has been canceled"),
//                                         "info",
//                                         payment_ok
//                                     )
//                                 );
//                             }
//                             retry_cnt += 1;
//                             if (retry_cnt >= MAX_RETRY) {
//                                 clearInterval(s);
//                                 resolve(
//                                     showMessageAndResolve(
//                                         _t("Payment status could not be confirmed"),
//                                         "error",
//                                         false
//                                     )
//                                 );
//                             }
//                         }, RETRY_DELAY);
//                     });
//                 }
//                 // If the state does not match any of the expected values
//                 return showMessageAndResolve(_t("Unknown payment status"), "error", false);
//             }
//         }
//     }

//     // private methods
//     _showMsg(msg, title) {
//         this.env.services.popup.add(ErrorPopup, {
//             title: "Mercado Pago " + title,
//             body: msg,
//         });
//     }
// }
