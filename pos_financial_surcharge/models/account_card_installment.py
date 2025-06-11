from odoo import models,  api


class AccountCard(models.Model):
    _inherit = "account.card.installment"

    @api.model
    def _load_pos_data_domain(self,  data):
        #return self.env['account.card']._check_company_domain(data['pos.config']['data'][0]['company_id'])
        return []

    @api.model
    def _load_pos_data_fields(self,  config_id):
        return [
            'id', 'card_id', 'name', 'divisor', 'installment', 'surcharge_coefficient', 'bank_discount'
        ]

    def _load_pos_data(self, data):
        domain = self._load_pos_data_domain(data)
        fields = self._load_pos_data_fields(data['pos.config']['data'][0]['id'])
        return {
            'data': self.search_read(domain, fields, load=False) if domain is not False else [],
            'fields': fields,
        }
