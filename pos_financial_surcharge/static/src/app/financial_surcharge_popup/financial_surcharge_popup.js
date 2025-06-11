import { useState } from "@odoo/owl";
import { ConfirmationDialog, AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { compute_price_force_price_include } from "@point_of_sale/app/models/utils/tax_utils";


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
        if (! this.state.selected_installment){
            this._showMsg(_t("You must select an installment"), _t("Error"));
            return false;
        }
        const instalments = this.props.line.models['account.card.installment'].getAllBy('id')
        const surcharge_coefficient = instalments[this.state.selected_installment].surcharge_coefficient;
        const diff_amount = (this.state.raw_amount * surcharge_coefficient) - this.state.raw_amount
        if (!diff_amount) {
            this.props.line.set_payment_status("done");
            return this.execButton(this.props.confirm);
        }
        const product_surcharge_id = this.props.pos.company.product_surcharge_id
        
        const new_price = compute_price_force_price_include(
                product_surcharge_id.taxes_id,
                diff_amount,
                product_surcharge_id,
                this.props.pos.config._product_default_values,
                this.props.pos.company,
                this.props.pos.currency,
                this.props.pos.models
        );
        const new_line = await this.props.pos.addLineToCurrentOrder({
                product_id: this.props.pos.company.product_surcharge_id.id,
                qty: 1,
                price_unit: new_price,
                note: instalments[this.state.selected_installment].name,
            });
        this.props.line.amount= this.state.raw_amount + new_line.price_subtotal_incl;
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
        this.state = useState({raw_amount : this.props.line.amount, selected_installment: false});
    }
    _showMsg(msg, title) {
        this.env.services.dialog.add(AlertDialog, {
            title: "Error " + title,
            body: msg,
        });
    }    
}