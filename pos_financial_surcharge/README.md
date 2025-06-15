# Módulo: POS - Recargo Financiero por Tarjeta

Este módulo permite aplicar recargos financieros personalizados según el plan de cuotas elegido por el cliente al pagar con tarjeta en el Punto de Venta (POS) de Odoo 18. Es especialmente útil para operaciones con tarjetas de crédito donde el comercio asume un interés bancario y desea trasladarlo al consumidor.

## Características Principales

- Permite asociar productos de recargo a métodos de pago POS.
- Soporte para múltiples tarjetas y planes de cuotas (cuotas, coeficiente de recargo, descuentos bancarios).
- Muestra un popup en el POS para seleccionar tarjeta, lote, cupón y plan de financiación.
- Calcula y agrega automáticamente el recargo como una línea adicional en el pedido.
- Configuración visual por método de pago para definir qué tarjetas están permitidas.
- Validaciones de productos sin impuestos en los recargos.

---

## Instalación

1. Clonar este módulo en el directorio de addons de tu instancia de Odoo:
    ```bash
    git clone https://github.com/filoquin/pos_payment.git
    ```

2. Activar el modo desarrollador en Odoo y habilitar el módulo.

---

## Configuración

### 1. Productos de Recargo
- Crear un producto tipo "Servicio" con `Disponible en POS` y sin impuestos y para argentina IVA 0% si se factura.
- Este producto se usará para cargar el importe adicional del plan de financiación.

### 2. Métodos de Pago POS
- Ir a **Punto de Venta → Configuración → Métodos de pago**.
- Seleccionar un método de tipo `Terminal` e integrar con `Card financial surcharge`.
- Asignar:
    - **Producto de recargo financiero**
    - **Tarjetas permitidas en POS**

### 3. Tarjetas y Cuotas
- Crear tarjetas en **Contabilidad → Configuración → Tarjetas**.
- Asociar planes de cuotas a cada tarjeta con:
    - Cantidad de cuotas
    - Coeficiente de recargo
    - Descuento bancario (opcional)

---

## Uso en el Punto de Venta

1. Al seleccionar un método de pago configurado con recargo, se abre automáticamente un popup.
2. El usuario debe seleccionar:
    - Tarjeta
    - Plan de cuotas
3. Se calcula el total ajustado y se agrega una línea de recargo si corresponde.
4. Se guarda una nota de cliente con los datos de la operación.

---

## Detalles Técnicos

- **Modelos Extendidos:**
    - `pos.payment.method`: Añade campo `bank_charge_prod_id` y `available_cards_ids`.
    - `account.card`: Filtrado en POS según método de pago.
    - `account.card.installment`: Cargado como dependencia POS.
- **Frontend:**
    - Reemplaza el flujo de pago estándar con un `PaymentInterface` personalizado.
    - Incluye popup interactivo con OWL.
- **Integración POS:**
    - Declaración con `register_payment_method("financial_surcharge", ...)`.

---

## Compatibilidad

- Odoo 18 (Tested)
- Compatible con POS Web y POS Touch
- Modo multi-tienda compatible

---

## Créditos

Desarrollado por: Martín Quinteros (Filoquin), Francisco Sulé. 
Especialista funcional y técnico en Odoo para Argentina 🇦🇷

---


