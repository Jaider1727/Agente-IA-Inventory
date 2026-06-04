'use strict';

const tools = [
  {
    type: 'function',
    function: {
      name: 'crear_factura',
      description: 'Crea una nueva factura en borrador para un cliente. Úsala cuando el admin mencione un nuevo cliente o pida crear/iniciar una factura.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Nombre del cliente o empresa' },
          client_id: { type: 'string', description: 'NIT o cédula del cliente (opcional)' },
          destination_city: { type: 'string', description: 'Ciudad de destino del despacho (opcional)' },
          destination_point: { type: 'string', description: 'Nombre del punto de venta o dirección de entrega (opcional)' },
          notes: { type: 'string', description: 'Notas adicionales (opcional)' },
        },
        required: ['client_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_item',
      description: 'Agrega un ítem a la factura activa. Verifica stock disponible y avisa si es insuficiente.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Nombre del producto (debe coincidir con el catálogo si existe)' },
          quantity: { type: 'number', description: 'Cantidad' },
          unit_price: { type: 'number', description: 'Precio unitario en pesos' },
        },
        required: ['description', 'quantity', 'unit_price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_factura',
      description: 'Muestra el resumen de la factura activa: cliente, destino, ítems y total.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalizar_factura',
      description: 'Despacha y finaliza la factura activa. Descuenta el stock del inventario. SOLO llamar después de que el admin confirmó explícitamente el despacho.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_factura',
      description: 'Cancela la factura activa. Úsala solo si el admin lo pide explícitamente.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'devolver_factura',
      description: 'Revierte una factura ya despachada (status finalized). Restaura el stock. SOLO llamar después de que el admin confirmó explícitamente la devolución.',
      parameters: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Referencia de la factura a devolver, ej: FAC-2024-091' },
        },
        required: ['reference'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_producto',
      description: 'Busca productos en el catálogo por nombre. Muestra precio y stock actual.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nombre o parte del nombre del producto' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_al_catalogo',
      description: 'Agrega un producto nuevo al catálogo con precio, unidad y stock inicial.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del producto' },
          default_price: { type: 'number', description: 'Precio unitario por defecto' },
          unit: { type: 'string', description: 'Unidad de medida (unidad, caja, kg, etc.)' },
          stock: { type: 'number', description: 'Stock inicial disponible (opcional, default 0)' },
          stock_min: { type: 'number', description: 'Umbral mínimo de alerta de stock (opcional, default 0)' },
        },
        required: ['name', 'default_price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_stock',
      description: 'Lista todos los productos del catálogo con su stock actual. Resalta los que están por debajo del mínimo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filtrar por nombre (opcional, muestra todos si se omite)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_producto',
      description: 'Edita los datos de un producto existente en el catálogo (nombre, precio, unidad, umbral mínimo). No modifica el stock.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre actual del producto (para buscarlo)' },
          new_name: { type: 'string', description: 'Nuevo nombre (opcional)' },
          new_price: { type: 'number', description: 'Nuevo precio unitario (opcional)' },
          new_unit: { type: 'string', description: 'Nueva unidad de medida (opcional)' },
          new_stock_min: { type: 'number', description: 'Nuevo umbral mínimo de alerta (opcional)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ajustar_stock',
      description: 'Actualiza el stock de un producto. Usar "entry" cuando llega mercancía (suma). Usar "adjustment" para corregir a un valor exacto (conteo físico).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del producto' },
          quantity: { type: 'number', description: 'Cantidad a sumar (entry) o valor exacto nuevo (adjustment)' },
          type: { type: 'string', enum: ['entry', 'adjustment'], description: '"entry" suma al stock actual. "adjustment" fija el stock al valor exacto.' },
          notes: { type: 'string', description: 'Motivo del ajuste (opcional)' },
        },
        required: ['name', 'quantity', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_cliente',
      description: 'Busca un cliente en el catálogo por nombre. Úsala SIEMPRE antes de crear una factura para autocompletar NIT y destino.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nombre o parte del nombre del cliente' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_cliente',
      description: 'Guarda un cliente nuevo en el catálogo para uso futuro.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del cliente o empresa' },
          client_id: { type: 'string', description: 'NIT o cédula (opcional)' },
          destination_city: { type: 'string', description: 'Ciudad de destino habitual (opcional)' },
          destination_point: { type: 'string', description: 'Punto de venta o dirección habitual (opcional)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exportar_factura',
      description: 'Genera un PDF de la factura y lo envía al admin por WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Referencia de la factura (opcional, usa la activa si se omite)' },
        },
        required: [],
      },
    },
  },
];

module.exports = { tools };
