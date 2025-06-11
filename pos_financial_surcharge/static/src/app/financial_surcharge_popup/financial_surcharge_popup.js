import { useState } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

export class FinancialSurchargePopup extends ConfirmationDialog {
    static template = "point_of_sale.FinancialSurchargeConfirmationDialog";
    static props = {
        ...ConfirmationDialog.props,
        line: Object,
        order: Object,
        cards: Object,
        pos: Object,
    };
    async _confirm() {
        debugger;
        const instalments = this.props.line.models['account.card.installment'].getAllBy('id')
        this.props.line.amount=this.state.raw_amount * instalments[this.state.selected_installment].surcharge_coefficient;
        const diff_amount = this.state.raw_amount - this.props.line.amount
        debugger;
        await this.props.pos.addLineToCurrentOrder({
                product_id: 26,// filo crea un data que te cree un producto recargo haber como lo podes relacionar
                qty: 1,
                price: diff_amount,
                note: instalments[this.state.selected_installment].name,
            });

        this.props.line.set_payment_status("done");
        return this.execButton(this.props.confirm);
    }

    static defaultProps = {
        ...ConfirmationDialog.defaultProps,
        confirmLabel: _t("Confirm Payment"),
        cancelLabel: _t("Cancel Payment"),
        title: _t("Card register"),
    };
    formatCurrency(amount) {
        return this.env.utils.formatCurrency(amount);
    }
    setup() {
        super.setup();
        this.props.body = _t(" %s", this.props.title);
        this.amount = this.env.utils.formatCurrency(this.props.line.amount);
        this.raw_amount = this.props.line.amount;
        this.cards = this.props.cards;
        this.state = useState({raw_amount : this.props.line.amount});
    }
}
