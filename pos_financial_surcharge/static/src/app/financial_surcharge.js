/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { ask } from "@point_of_sale/app/store/make_awaitable_dialog";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { FinancialSurchargePopup } from "@pos_financial_surcharge/app/financial_surcharge_popup/financial_surcharge_popup";


export class FinancialSurcharge extends PaymentInterface {

    async _get_cards(){
       const res = []
       const installment_ids = this.pos.models['account.card.installment'].getAll()
       const available_card_ids = this.payment_method_id.available_card_ids.map((card)=> card.id);
       for (const card of this.pos.models['account.card'].getAll().filter((card) =>{
            return available_card_ids.includes(card.id);
       })
    ) {
            res.push({
                id: card.id,
                name: card.name,
                installments: installment_ids.filter((installment) => {
                    return installment.card_id.id == card.id;
                }).map((installment) => {
                    return {
                        id: installment.id,
                        name: installment.name,
                        divisor: installment.divisor,
                        installment: installment.installment,
                        surcharge_coefficient: installment.surcharge_coefficient,
                        bank_discount: installment.bank_discount,
                    };
                }),
            })
        }
        return res;
    }
    async send_payment_request(cid) {
        await super.send_payment_request(...arguments);
        const line = this.pos.get_order().get_selected_paymentline();
        try {
            // During payment creation, user can't cancel the payment intent
            line.set_payment_status("waitingCapture");
            return await ask(
                this.env.services.dialog,
                {
                    title: 'Select payment intallment ',
                    line: line,
                    cards: await this._get_cards(),
                    order: line.pos_order_id,
                    pos: this.pos,
                },
                {},
                FinancialSurchargePopup
            ).then((result) => {
                return result;
            });

        } catch (error) {
            console.error(error);
            this._showMsg('error', "System error");
            return false;
        }
    }

    async send_payment_cancel(order, cid) {
        await super.send_payment_cancel(order, cid);
        return true;
    }
    // private methods
    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Error " + title,
            body: msg,
        });
    }
}