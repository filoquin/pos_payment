odoo.define('pos_mercado_pago.models.models', function (require) {
    var models = require('point_of_sale.models');
    var PaymentMercadoPagoQR = require('pos_mercado_pago.payment_qr');
    var PaymentMercadoPago = require('pos_mercado_pago.payment');

    models.register_payment_method('mercado_pago', PaymentMercadoPago);
    models.register_payment_method('mercado_pago_qr', PaymentMercadoPagoQR);

    models.load_fields('pos.payment.method', 'mp_id_point_smart');

    const superPaymentline = models.Paymentline.prototype;
    models.Paymentline = models.Paymentline.extend({
        initialize: function(attr, options) {
            superPaymentline.initialize.call(this,attr,options);
            this.terminalServiceId = this.terminalServiceId  || null;
        },
        export_as_JSON: function(){
            const json = superPaymentline.export_as_JSON.call(this);
            json.terminal_service_id = this.terminalServiceId;
            return json;
        },
        init_from_JSON: function(json){
            superPaymentline.init_from_JSON.apply(this,arguments);
            this.terminalServiceId = json.terminal_service_id;
        },
        setTerminalServiceId: function(id) {
            this.terminalServiceId = id;
        }
    });

    });
