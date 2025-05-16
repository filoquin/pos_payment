{
    'name': 'POS Mercado Pago QR',
    'version': "18.0.1.0.0",
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Integrate your POS with the Mercado Pago Smart Point terminal',
    'data': [
        'views/pos_payment_method_views.xml',
    ],
    'depends': ['pos_mercado_pago'],
    'installable': True,
    'assets': {
        'point_of_sale.assets': [
            'pos_mercado_pago/static/src/js/*',
            'pos_mercado_pago/static/src/xml/*',
        ],
    },
    'post_load': 'monkey_patches',
    'license': 'LGPL-3',
}
