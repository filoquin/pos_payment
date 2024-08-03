{
    'name': 'POS Mercado Pago',
    'version': '15.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Integrate your POS with the Mercado Pago Smart Point terminal',
    'data': [
        'views/pos_payment_method_views.xml',
    ],
    'demo': [
        'demo/pos_payment_method.xml',
    ],
    'depends': ['point_of_sale'],
    'installable': True,
    'assets': {
        'point_of_sale.assets': [
            'pos_mercado_pago/static/src/js/*',
        ],
    },
    'license': 'LGPL-3',
}
