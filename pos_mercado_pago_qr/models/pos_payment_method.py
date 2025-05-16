import logging

from odoo import fields, api,models, _
from odoo.exceptions import AccessError, UserError
from odoo.tools.float_utils import json_float_round

from .mercado_pago_pos_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    mp_user_id = fields.Char(groups="point_of_sale.group_pos_manager")
    mp_store_id = fields.Char()
    mp_pos_id = fields.Char()
    mp_external_store_id = fields.Char()
    mp_external_pos_id = fields.Char()
    mp_qr_url = fields.Char(string="QR URL")

    def write(self, vals):
        records = super().write(vals)
        use_payment_terminal = vals.get('use_payment_terminal', self.use_payment_terminal)
        if use_payment_terminal == 'mercado_pago_qr' and ('mp_store_id' in vals  or 'mp_bearer_token' in vals):
            self.set_qr_info()
        return records

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records.filtered(lambda x: x.mp_bearer_token and x.use_payment_terminal == 'mercado_pago_qr'):
            record.set_qr_info()
        return records

    #########################
    # QR methods
    #########################

    def set_qr_info(self):
        self.ensure_one()
        mercado_pago = MercadoPagoPosRequest(self.mp_bearer_token)
        data = mercado_pago.call_mercado_pago("get", f"/stores/{self.mp_store_id}", {})
        if data.get('external_id'):
            self.mp_external_store_id = data['external_id']
        else:
            body = {'external_id' : f"store{self.id}"}
            mercado_pago.call_mercado_pago("put", f"/users/{self.mp_user_id}/stores/{self.mp_store_id}" , body)
            self.mp_external_store_id = f"store{self.id}"

        if self.mp_pos_id:
            data = mercado_pago.call_mercado_pago("get", f"/pos/{self.mp_pos_id}", {})
            self.mp_qr_url = data['qr']['template_document']
            if data.get('external_id'):
                self.mp_external_pos_id = data['external_id']
            else:
                raise UserError('El pos no tiene external_id')
        else:
            body = {'external_id': f"pos{self.id}",
                    'external_store_id': self.mp_external_store_id,
                    'fixed_amount': True,
                    'name': self.name,
                    'store_id': self.mp_store_id,
            }
            data = mercado_pago.call_mercado_pago("post", "/pos", body)
            self.write({
                'mp_external_pos_id': data['external_id'],
                'mp_pos_id': str(data['id']),
                'mp_qr_url': data['qr']['template_document'],
            })

    def mp_payment_order_create(self, infos):
        """
        Called from frontend for creating a payment order in Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        method_sudo = self.sudo()
        # fix infos
        infos['total_amount'] = json_float_round(infos['total_amount'], 2)
        infos['items'][0]['total_amount'] = json_float_round(infos['total_amount'], 2)
        infos['items'][0]['unit_price'] = json_float_round(infos['total_amount'], 2)

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend creation
        resp = mercado_pago.call_mercado_pago("put", f"/instore/qr/seller/collectors/{method_sudo.mp_user_id}/stores/{self.mp_external_store_id}/pos/{self.mp_external_pos_id}/orders", infos)
        _logger.debug("mp_payment_order_create(), response from Mercado Pago: %s", resp)
        _logger.info(resp)
        return resp


    def mp_payment_order_get(self, external_reference):
        """
        Called from frontend to get the last payment order from Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend status

        resp = mercado_pago.call_mercado_pago("get", f"/merchant_orders/?external_reference={external_reference}", {})
        _logger.info("mp_payment_order_get(), response from Mercado Pago: %s", resp)
        return resp

    def mp_payment_order_cancel(self, infos):
        """
        Called from frontend to cancel a payment order in Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment order cancelation
        method_sudo = self.sudo()
        resp = mercado_pago.call_mercado_pago("delete", f"/instore/qr/seller/collectors/{method_sudo.mp_user_id}/pos/{self.mp_external_pos_id}/orders", infos)
        _logger.info("mp_payment_order_cancel(), response from Mercado Pago: %s", resp)
        return resp

    def find_more_pos(self):
        self.ensure_one()
        mercado_pago = MercadoPagoPosRequest(self.mp_bearer_token)
        data = mercado_pago.call_mercado_pago("get", "/pos", {})
        existing_qr = self.search([('mp_pos_id', '!=', False)]).mapped('mp_pos_id')
        if 'results' in data:
            for pos in data['results']:
                if pos['id'] not in existing_qr and pos.get('external_id'):
                    self.copy({
                        'name': pos.get('name') or pos.get('id'),
                        'mp_user_id': pos.get('user_id'),
                        'mp_store_id': pos.get('store_id'),
                        'mp_pos_id': str(pos.get('id')),
                    })

    def mp_unused_payment_get(self, payment_id):
        """
        Called from frontend to get the last payment intend from Mercado Pago
        """
        exist = self.env['pos.payment'].sudo().search([('transaction_id', 'ilike', '%%%s%%' % payment_id)])
        if exist:
            return {'status': 'used', 'message': 'El pago %s ya fue utilizado en otra venta. No puede reutilizar' % payment_id}
        return self.mp_payment_get(payment_id)
