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
        const instalments = this.props.line.models['account.card.installment'].getAllBy('id');
        const selected_id = this.state.selected_installment;
        const installment = instalments[selected_id];


        if (!installment) {
            console.warn("⚠️ Plan de cuotas no encontrado.");
            return this.execButton(this.props.confirm);
        }

        const surcharge_coefficient = installment.surcharge_coefficient || 1.0;
        const raw_amount = this.state.raw_amount;
        const total_with_surcharge = raw_amount * surcharge_coefficient;
        const diff_amount = total_with_surcharge - raw_amount;

        this.props.line.amount = total_with_surcharge;

        const pos_payment_method = this.props.line.payment_method_id?.raw;

        if (surcharge_coefficient > 1.0 && diff_amount > 0.0) {
            if (pos_payment_method && pos_payment_method.bank_charge_prod_id) {
                const product = this.props.pos.models['product.product'].getBy('id', pos_payment_method.bank_charge_prod_id);
                if (product) {
                    const tax = this.props.pos.models['account.tax'].getBy('id', 1);
                    if (tax && (!product.taxes_id || product.taxes_id.length === 0)) {
                        product.taxes_id = [tax.id];
                    }

                    console.log("🔍 PRODUCTO CARGADO:");
                    console.log("ID:", product.id);
                    console.log("Nombre:", product.display_name);
                    console.log("Taxes ID:", product.taxes_id);
                    console.log("Tipo:", product.type);

                    this.props.pos.addLineToCurrentOrder({
                        product_id: product,
                        price_unit: parseFloat(diff_amount.toFixed(2)),
                    }, {});

                    const order = this.props.pos.get_order();
                    const orderLines = order.get_orderlines();
                    const lastLine = orderLines[orderLines.length - 1];

                    const card_name = installment.card_id?.name || "Tarjeta desconocida";
                    const installment_name = installment.name;
                    lastLine.set_customer_note(`Tarjeta: ${card_name} | Cuotas: ${installment_name}`);
                } else {
                    console.warn("⚠️ Producto de recargo no encontrado.");
                }
            } else {
                console.warn("⚠️ No se encontró el método de pago o el producto.");
            }
        }

        console.log("💳 Nuevo monto del pago:", this.props.line.amount);
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
        this.state = useState({ raw_amount: this.props.line.amount });
    }
}