import logging

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [('financial_surcharge', 'Card financial surcharge')]

    bank_charge_prod_id = fields.Many2one(
        'product.product',
        domain=[('type', '=', 'service'), ('available_in_pos', '=', True)],
        string="Financial Surcharge Product"
    )

    @api.onchange('bank_charge_prod_id')
    def _onchange_bank_charge_prod_id(self):
        if self.bank_charge_prod_id and self.bank_charge_prod_id.taxes_id:
            raise ValidationError(_("Add a product without taxes."))

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        params += ['bank_charge_prod_id']
        return params
