/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class PaymentMercadoPagoQR extends PaymentInterface {
    async create_payment_qr() {
        const order = this.pos.get_order();
        const line = order.get_selected_paymentline();
        // Build informations for creating a payment intend on Mercado Pago.
        // Data in "external_reference" are send back with the webhook notification
        let entropy = Date.now() + Math.random();
        line.externalReference = `QR_${this.pos.pos_session.id}_${line.payment_method.id}_${line.cid}_${entropy}`;
        const infos = {
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
                total_amount: line.amount,
            }],
            external_reference: line.externalReference
        };

        // mp_payment_order_create will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_order_create",
            [[line.payment_method_id.id], infos]
        );
    }

    async mp_payment_order_get() {
        const line = this.pos.get_order().get_selected_paymentline();
        // mp_payment_intent_get will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_order_get",
            [[line.payment_method_id.id], line.externalReference]
        );
    }

    async cancel_payment_order() {
        const line = this.pos.get_order().get_selected_paymentline();
        // mp_payment_order_cancel will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_payment_order_cancel",
            [[line.payment_method_id.id], line.externalReference]
        );
    }

    async get_payment(payment_id) {
        const line = this.pos.get_order().get_selected_paymentline();
        // mp_get_payment_status will call the Mercado Pago api
        return await this.env.services.orm.silent.call(
            "pos.payment.method",
            "mp_get_payment_status",
            [[line.payment_method_id.id], payment_id]
        );
    }

    setup() {
        super.setup(...arguments);
        this.webhook_resolver = null;
        this.payment_intent = {};
    }

    async send_payment_request(cid) {
        await super.send_payment_request(...arguments);
        const line = this.pos.get_order().get_selected_paymentline();
        try {
            // During payment creation, user can't cancel the payment intent
            line.set_payment_status("waitingCapture");
            // Call Mercado Pago to create a payment intent
            const payment_order = await this.create_payment_qr();
            if (! payment_order) {
                this._showMsg(payment_order.message, "error");
                return false;
            }
            // Payment intent creation successfull, save it
            this.payment_order = payment_order;
            // After payment creation, make the payment intent canceling possible
            line.set_payment_status("waitingCard");
            // Wait for payment intent status change and return status result
            return await new Promise((resolve) => {
                this.webhook_resolver = resolve;
            });
        } catch (error) {
            this._showMsg(error, "System error");
            return false;
        }
    }

    async send_payment_cancel(order, cid) {
        await super.send_payment_cancel(order, cid);
        if (!("id" in this.payment_intent)) {
            return true;
        }
        const canceling_status = await this.cancel_payment_intent();
        if ("error" in canceling_status) {
            const message =
                canceling_status.status === 409
                    ? _t("Payment has to be canceled on terminal")
                    : _t("Payment not found (canceled/finished on terminal)");
            this._showMsg(message, "info");
            return canceling_status.status !== 409;
        }
        return true;
    }

    async handleMercadoPagoQRWebhook() {
        const line = this.pos.get_order().get_selected_paymentline();
        const MAX_RETRY = 5; // Maximum number of retries for the "ON_TERMINAL" BUG
        const RETRY_DELAY = 1000; // Delay between retries in milliseconds for the "ON_TERMINAL" BUG

        const showMessageAndResolve = (messageKey, status, resolverValue) => {
            if (!resolverValue) {
                this._showMsg(messageKey, status);
            }
            line.set_payment_status("done");
            this.webhook_resolver?.(resolverValue);
            return resolverValue;
        };

        const handleFinishedPayment = async (paymentIntent) => {
            if (paymentIntent.state === "CANCELED") {
                return showMessageAndResolve(_t("Payment has been canceled"), "info", false);
            }
            if (["FINISHED", "PROCESSED"].includes(paymentIntent.state)) {
                const payment = await this.get_payment(paymentIntent.payment.id);
                if (payment.status === "approved") {
                    return showMessageAndResolve(_t("Payment has been processed"), "info", true);
                }
                return showMessageAndResolve(_t("Payment has been rejected"), "info", false);
            }
        };

        // No payment intent id means either that the user reload the page or
        // it is an old webhook -> trash
        if ("id" in this.payment_intent) {
            // Call Mercado Pago to get the payment intent status
            let last_status_payment_intent = await this.mp_payment_order_get();
            // Bad payment intent id, then it's an old webhook not related with the
            // current payment intent -> trash
            if (this.payment_intent.id == last_status_payment_intent.id) {
                if (
                    ["FINISHED", "PROCESSED", "CANCELED"].includes(last_status_payment_intent.state)
                ) {
                    return await handleFinishedPayment(last_status_payment_intent);
                }
                // BUG Sometimes the Mercado Pago webhook return ON_TERMINAL
                // instead of CANCELED/FINISHED when we requested a payment status
                // that was actually canceled/finished by the user on the terminal.
                // Then the strategy here is to ask Mercado Pago MAX_RETRY times the
                // payment intent status, hoping going out of this status
                if (["OPEN", "ON_TERMINAL"].includes(last_status_payment_intent.state)) {
                    return await new Promise((resolve) => {
                        let retry_cnt = 0;
                        const s = setInterval(async () => {
                            last_status_payment_intent =
                                await this.mp_payment_order_get();
                            if (
                                ["FINISHED", "PROCESSED", "CANCELED"].includes(
                                    last_status_payment_intent.state
                                )
                            ) {
                                clearInterval(s);
                                resolve(await handleFinishedPayment(last_status_payment_intent));
                            }
                            retry_cnt += 1;
                            if (retry_cnt >= MAX_RETRY) {
                                clearInterval(s);
                                resolve(
                                    showMessageAndResolve(
                                        _t("Payment status could not be confirmed"),
                                        "error",
                                        false
                                    )
                                );
                            }
                        }, RETRY_DELAY);
                    });
                }
                // If the state does not match any of the expected values
                return showMessageAndResolve(_t("Unknown payment status"), "error", false);
            }
        }
    }

    // private methods
    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Mercado Pago " + title,
            body: msg,
        });
    }
}
