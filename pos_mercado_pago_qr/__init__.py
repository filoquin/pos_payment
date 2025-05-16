from . import models
from . import controllers


from odoo.addons.pos_mercado_pago.mercado_pago_pos_request.MercadoPagoPosRequest import MercadoPagoPosRequest, MERCADO_PAGO_API_ENDPOINT, REQUEST_TIMEOUT


def monkey_patches():
    def call_mercado_pago_patch(self, method, endpoint, payload):
        """ Add monkey patch to MercadoPagoPosRequest.call_mercado_pago for
            handling result of delete and put requests.

        :param method: "GET", "POST", "DELETE", "PUT", ...
        :param endpoint: The endpoint to be reached by the request.
        :param payload: The payload of the request.
        :return The JSON-formatted content of the response.
        """
        endpoint = MERCADO_PAGO_API_ENDPOINT + endpoint
        header = {'Authorization': f"Bearer {self.mercado_pago_bearer_token}"}
        try:
            response = requests.request(method, endpoint, headers=header, json=payload, timeout=REQUEST_TIMEOUT)
            if method in ["DELETE", "PUT"]:
                return response.ok
            return response.json()
        except requests.exceptions.RequestException as error:
            _logger.warning("Cannot connect with Mercado Pago POS. Error: %s", error)
            return {'errorMessage': str(error)}
        except ValueError as error:
            _logger.warning("Cannot decode response json. Error: %s", error)
            return {'errorMessage': f"Cannot decode Mercado Pago POS response. Error: {error}"}


    MercadoPagoPosRequest.call_mercado_pago = call_mercado_pago_patch
