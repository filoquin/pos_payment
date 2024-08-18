odoo.define('payment_mercado_pago.PosQRPaymentScreen', function (require) {
    'use strict';

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const { useListener } = require("@web/core/utils/hooks");
    const Registries = require('point_of_sale.Registries');

    const PosQRPaymentScreen = (PaymentScreen) =>
        class extends PaymentScreen {
            setup() {
                super.setup();
                useListener('manual_payment-request', this._manualPaymentRequest);
            }

            async _manualPaymentRequest({ detail: line }) {
                const payment_terminal = line.payment_method.payment_terminal;
                const manual_payment = await payment_terminal._checkPaymentRequest(line.cid);

            }

        };

    Registries.Component.extend(PaymentScreen, PosQRPaymentScreen);

    return PosQRPaymentScreen;
});
