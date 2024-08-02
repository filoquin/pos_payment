import logging

from odoo import fields, api,models, _
from odoo.exceptions import AccessError, UserError
from odoo.tools.float_utils import json_float_round

from .mercado_pago_pos_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    mp_bearer_token = fields.Char(
        string="Access token",
        help='Mercado Pago customer production user token: https://www.mercadopago.com.mx/developers/en/reference',
        groups="point_of_sale.group_pos_manager")
    mp_test_scope = fields.Boolean()
    mp_webhook_secret_key = fields.Char(
        string="Public key",
        help='Mercado Pago production secret key from integration application: https://www.mercadopago.com.mx/developers/panel/app',
        groups="point_of_sale.group_pos_manager")
    mp_id_point_smart = fields.Char(
        string="Terminal S/N",
        help="Enter your Point Smart terminal serial number written on the back of your terminal (after the S/N:)")
    mp_id_point_smart_complet = fields.Char()
    mp_user_id = fields.Char(groups="point_of_sale.group_pos_manager")
    mp_store_id = fields.Char()
    mp_pos_id = fields.Char()

    mp_external_store_id = fields.Char()
    mp_external_pos_id = fields.Char()
    mp_qr_url = fields.Char(string="QR URL")

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [('mercado_pago', 'Mercado Pago'), ('mercado_pago_qr', 'Mercado Pago QR')]

    def force_pdv(self):
        """
        Triggered in debug mode when the user wants to force the "PDV" mode.
        It calls the Mercado Pago API to set the terminal mode to "PDV".
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        _logger.info('Calling Mercado Pago to force the terminal mode to "PDV"')

        mode = {"operating_mode": "PDV"}
        resp = mercado_pago.call_mercado_pago("patch", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}", mode, self.mp_test_scope)
        if resp.get("operating_mode") != "PDV":
            raise UserError(_("Unexpected Mercado Pago response: %s", resp))
        _logger.debug("Successfully set the terminal mode to 'PDV'.")
        return None

    def force_standalone(self):
        """
        Triggered in debug mode when the user wants to force the "STANDALONE" mode.
        It calls the Mercado Pago API to set the terminal mode to "STANDALONE".
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        _logger.info('Calling Mercado Pago to force the terminal mode to "STANDALONE"')

        mode = {"operating_mode": "STANDALONE"}
        resp = mercado_pago.call_mercado_pago("patch", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}", mode, self.mp_test_scope)
        if resp.get("operating_mode") != "STANDALONE":
            raise UserError(_("Unexpected Mercado Pago response: %s", resp))
        _logger.debug("Successfully set the terminal mode to 'STANDALONE'.")
        return None

    def mp_payment_intent_create(self, infos):
        """
        Called from frontend for creating a payment intent in Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend creation
        resp = mercado_pago.call_mercado_pago("post", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}/payment-intents", infos, self.mp_test_scope)
        _logger.debug("mp_payment_intent_create(), response from Mercado Pago: %s", resp)
        _logger.info(resp)
        return resp

    def mp_payment_intent_get(self, payment_intent_id):
        """
        Called from frontend to get the last payment intend from Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend status
        resp = mercado_pago.call_mercado_pago("get", f"/point/integration-api/payment-intents/{payment_intent_id}", {}, self.mp_test_scope)
        _logger.info("mp_payment_intent_get(), response from Mercado Pago: %s", resp)
        if resp.get('state') in ['FINISHED', 'PROCESSED']:
            resp['payment_info'] = self.mp_payment_get(resp.get('payment',{}).get('id'))
        return resp

    def mp_payment_get(self, payment_id):
        """
        Called from frontend to get the last payment intend from Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend status
        resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{payment_id}", {}, self.mp_test_scope)
        _logger.info("mp_payment_get(), response from Mercado Pago: %s", resp)
        return resp

    def mp_payment_intent_cancel(self, payment_intent_id):
        """
        Called from frontend to cancel a payment intent in Mercado Pago
        """
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend cancelation
        resp = mercado_pago.call_mercado_pago("delete", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}/payment-intents/{payment_intent_id}", {}, self.mp_test_scope)
        _logger.info("mp_payment_intent_cancel(), response from Mercado Pago: %s", resp)
        return resp

    def _find_terminal(self, token, point_smart):
        mercado_pago = MercadoPagoPosRequest(token)
        data = mercado_pago.call_mercado_pago("get", "/point/integration-api/devices", {}, self.mp_test_scope)
        if 'devices' in data:
            # Search for a device id that contains the serial number entered by the user
            found_device = next((device for device in data['devices'] if point_smart in device['id']), None)

            if not found_device:
                raise UserError(_("The terminal serial number is not registered on Mercado Pago"))

            return found_device.get('id', '')
        else:
            raise UserError(_("Please verify your production user token as it was rejected"))

    def write(self, vals):
        records = super().write(vals)
        use_payment_terminal = vals.get('use_payment_terminal', self.use_payment_terminal)
        if use_payment_terminal == 'mercado_pago' and ('mp_id_point_smart' in vals or 'mp_bearer_token' in vals):
            self.mp_id_point_smart_complet = self._find_terminal(self.mp_bearer_token, self.mp_id_point_smart)
        if use_payment_terminal == 'mercado_pago_qr' and ('mp_store_id' in vals  or 'mp_bearer_token' in vals):
            self.set_qr_info()

        return records

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)

        for record in records.filtered(lambda x: x.mp_bearer_token and x.use_payment_terminal == 'mercado_pago'):
            record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)

        for record in records.filtered(lambda x: x.mp_bearer_token and x.use_payment_terminal == 'mercado_pago_qr'):
            record.set_qr_info()

        return records

    def find_more_points(self):
        self.ensure_one()
        mercado_pago = MercadoPagoPosRequest(self.mp_bearer_token)
        data = mercado_pago.call_mercado_pago("get", "/point/integration-api/devices", {}, self.mp_test_scope)
        existing_devices = self.search([('mp_id_point_smart_complet', '!=', False)]).mapped('mp_id_point_smart_complet')
        if 'devices' in data:
            for device in data['devices']:
                if device['id'] not in existing_devices:
                    self.copy({
                        'name': device.get('external_pos_id') or device.get('id'),
                        'mp_webhook_secret_key': self.mp_webhook_secret_key,
                        'mp_bearer_token': self.mp_bearer_token,
                        'mp_id_point_smart': device.get('id').split('_')[-1] ,
                        'mp_id_point_smart_complet': device.get('id'),
                    })

    #########################
    # QR methods
    #########################

    def set_qr_info(self):
        self.ensure_one()
        mercado_pago = MercadoPagoPosRequest(self.mp_bearer_token)
        data = mercado_pago.call_mercado_pago("get", f"/stores/{self.mp_store_id}", {}, self.mp_test_scope)
        if data.get('external_id'):
            self.mp_external_store_id = data['external_id']
        else:
            body = {'external_id' : f"store{self.id}"}
            mercado_pago.call_mercado_pago("put", f"/users/{self.mp_user_id}/stores/{self.mp_store_id}" , body, self.mp_test_scope)
            self.mp_external_store_id = f"store{self.id}"

        if self.mp_pos_id:
            data = mercado_pago.call_mercado_pago("get", f"/pos/{self.mp_pos_id}", {}, self.mp_test_scope)
            self.mp_qr_url = data['qr']['template_document']
            if data.get('external_id'):
                self.mp_external_pos_id = data['external_id']
            else:
                raise UserError('El pos no tiene external_id')
        else:
            body = {'external_id' : f"pos{self.id}",
                    'external_store_id': self.mp_external_store_id,
                    'fixed_amount': True,
                    'name': self.name,
                    'store_id': self.mp_store_id,
            }
            data = mercado_pago.call_mercado_pago("post", f"/pos" , body, self.mp_test_scope)
            self.write({
                'mp_external_pos_id' : data['external_id'],
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
        #fix infos
        infos['total_amount'] = json_float_round(infos['total_amount'],2)
        infos['items'][0]['total_amount'] = json_float_round(infos['total_amount'],2)
        infos['items'][0]['unit_price'] = json_float_round(infos['total_amount'],2)

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for payment intend creation
        resp = mercado_pago.call_mercado_pago("put", f"/instore/qr/seller/collectors/{method_sudo.mp_user_id}/stores/{self.mp_external_store_id}/pos/{self.mp_external_pos_id}/orders", infos, self.mp_test_scope)
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

        resp = mercado_pago.call_mercado_pago("get", f"/merchant_orders/?external_reference={external_reference}", {}, self.mp_test_scope)
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
        resp = mercado_pago.call_mercado_pago("delete", f"/instore/qr/seller/collectors/{method_sudo.mp_user_id}/pos/{self.mp_external_pos_id}/orders", infos, self.mp_test_scope)
        _logger.info("mp_payment_order_cancel(), response from Mercado Pago: %s", resp)
        return resp
