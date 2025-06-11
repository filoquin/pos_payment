import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    available_card_ids = fields.Many2many(
        "account.card", string="Cards", 
    )


    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [('financial_surcharge', 'Card financial surcharge')]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return super()._load_pos_data_fields(config_id) + ['available_card_ids']