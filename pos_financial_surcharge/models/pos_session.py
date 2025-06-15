from odoo import api, fields, models, _, Command
from odoo.exceptions import AccessDenied, AccessError, UserError, ValidationError


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config_id):
        return super()._load_pos_data_models(config_id) + ['account.card', 'account.card.installment']
