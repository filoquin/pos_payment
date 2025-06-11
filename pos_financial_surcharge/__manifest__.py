{
    'name': 'Pos Financial Surchage',
    'version': "18.0.1.0.0",
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Add pos finanacial surcharge',
    'data': [
        'views/card_installment_view.xml',
    ],
    'depends': ['point_of_sale', 'card_installment'],
    'installable': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_financial_surcharge/static/src/**/*',
            'pos_financial_surcharge/static/src/**/**/*',
        ],
    },
    'license': 'LGPL-3',
}
