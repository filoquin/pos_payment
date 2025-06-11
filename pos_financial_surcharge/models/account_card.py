from odoo import models, api, fields


class AccountCard(models.Model):
    _inherit = "account.card"

    available_in_pos = fields.Boolean(
        string='Available in POS',
        help='Check if you want this card can be used in the Point of Sale.',
        default=False
    )

    @api.model
    def _load_pos_data_domain(self, data):
        return self.env['account.card']._check_company_domain(data['pos.config']['data'][0]['company_id']) 
        #+ [('available_in_pos', '=', True)]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return [
            'id', 'name', 'installment_ids'
        ]

    def _load_pos_data(self, data):
        domain = self._load_pos_data_domain(data)
        fields = self._load_pos_data_fields(data['pos.config']['data'][0]['id'])
        return {
            'data': self.search_read(domain, fields, load=False) if domain is not False else [],
            'fields': fields,
        }
