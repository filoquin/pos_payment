from odoo import api, models


class ResCompany(models.Model):
    _inherit = "res.company"

    @api.model
    def _load_pos_data_fields(self, config_id):
        return super()._load_pos_data_fields(config_id) + ['product_surcharge_id']
