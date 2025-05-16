/** @odoo-module */
import { register_payment_method } from "@point_of_sale/app/store/pos_store";
import { PaymentMercadoPagoQR } from "@pos_mercado_pago_qr/app/payment_mercado_pago_qr";

register_payment_method("mercado_pago_qr", PaymentMercadoPagoQR);
