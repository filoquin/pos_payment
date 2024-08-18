odoo.define("payment_mercado_pago.MercadoPagoManualPopup", function (require) {
    "use strict";

    var core = require('web.core');
    const { useState } = owl;
    const AbstractAwaitablePopup = require("point_of_sale.AbstractAwaitablePopup");
    const Registries = require("point_of_sale.Registries");
    const rpc = require('web.rpc');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

    class MercadoPagoManualPopup extends AbstractAwaitablePopup {
        /**
         * @param {Object} props
         */
        setup() {
            super.setup();
            this.state = useState({ paymentId: '' });
        }
        get title() {
            return this.props.name;
        }
        get currentOrder() {
            return this.env.pos.get_order();
        }
        async getPaymentById() {
            self = this;
            rpc.query({
                model: 'pos.payment.method',
                method: 'mp_unused_payment_get',
                args: [[this.props.line.payment_method.id], this.state.paymentId],
            }, {
                // When a payment terminal is disconnected it takes Adyen
                // a while to return an error (~6s). So wait 20 seconds
                // before concluding Odoo is unreachable.
                timeout: 20000,
                shadow: true,
            }).then((res) => {
                console.log(res);
                if (res.status == 400 || res.status == 403 || res.status == 404 || res.status == 'used'){
                    self._show_error(res.message);
                    return;
                } else if (res.status != 'approved'){
                    let error_text = `El pago esta en estado ${res.status}. Verifique el numero`
                    self._show_error(error_text, 'El pago no esta aprobado');
                    return;
                } else if (res.status == 'approved'){
                    let payment_window = self.props.paymentTimeWindow * 60 * 60 * 100; 
                    let payment_old = Date.now() - Date.parse(res.date_approved);
                    if (payment_old > payment_window){
                        let error_text = `La ventana para utilizar un pago es de ${self.props.paymentTimeWindow} minutos. El pago esta aprobado en la fecha ${res.date_approved}.`;
                        self._show_error(error_text, 'El pago es antigüo');
                        return;
                    }
                    if (self.props.line.payment_status == 'done'){
                        let error_text = `El pago no esta pendiente en el pos`;
                        self._show_error(error_text, 'Mercadopago error');
                        return;
                    }
                    self.props.line.set_amount(res.transaction_amount);
                    self.props.line.set_payment_status('done');
                    self.props.line.transaction_id = res.id;
                    this.env.posbus.trigger('close-popup', {
                        popupId: this.props.id,
                        response: { confirmed: false, payload: null },
                    });
        
                }

            }).catch(this._handle_odoo_connection_failure.bind(this));
            
        } 
        _handle_odoo_connection_failure(error) {
            this._show_error(error.message.data.message);
        }
        _show_error(msg, title) {
            if (!title) {
                title =  _t('Mercadopago Error');
            }
            Gui.showPopup('ErrorPopup',{
                'title': title,
                'body': msg,
            });
        }
    }
    MercadoPagoManualPopup.template = "MercadoPagoManualPopup";

    Registries.Component.add(MercadoPagoManualPopup);
    return MercadoPagoManualPopup;
});
