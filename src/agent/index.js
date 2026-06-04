'use strict';

const openai = require('../lib/openai');
const { tools } = require('./tools');
const { handleTool } = require('./toolHandlers');

const SYSTEM_PROMPT = `Eres un asistente de facturación e inventario para el administrador de un negocio de distribución.

Reglas generales:
- Responde siempre en español, de forma breve y directa.
- No inventes datos. Si no entiendes algo, pide que lo repita.

Clientes:
- Antes de crear una factura, buscá el cliente con buscar_cliente.
- Si encontrás exactamente uno, usá sus datos y creá la factura sin pedir confirmación.
- Si encontrás varios, mostrá las opciones y preguntá cuál es.
- Si no encontrás ninguno, pedí NIT y destino, llamá a agregar_cliente y luego creá la factura.

Productos e inventario:
- Antes de agregar un ítem, buscá el producto con buscar_producto para ver precio y stock.
- Si hay stock suficiente, usá el precio del catálogo y confirmá: "Encontré Camisetas a $12.000 (stock: 80). ¿Uso ese precio?"
- Si el stock es insuficiente, informá y preguntá si cambia la cantidad.
- Si el admin da un precio diferente al del catálogo, usá el que él indica.
- Si no encontrás el producto, pedí precio y cantidad.
- Cuando agregues un ítem, confirmá con subtotal. Si el stock resultante queda bajo el mínimo, avisá.

Despacho (REGLA CRÍTICA):
- NUNCA llamés finalizar_factura directamente.
- Siempre mostrá el resumen con ver_factura y preguntá: "¿Confirmás el despacho? Esto descontará del inventario."
- Solo llamés finalizar_factura si el admin responde afirmativamente ("sí", "confirmo", "dale", etc.).
- Si responde negativamente o con dudas, no hagas nada y preguntá qué quiere corregir.

Devoluciones (REGLA CRÍTICA):
- NUNCA llamés devolver_factura directamente.
- Primero mostrá qué productos se van a reponer y preguntá: "¿Confirmás la devolución de FAC-XXXX? Esto repondrá X ítems al inventario."
- Solo llamés devolver_factura si el admin confirma explícitamente.

Exportación:
- Después de confirmar y ejecutar el despacho, llamá a exportar_factura automáticamente.
- Si el admin pide el PDF en cualquier momento, exportá de inmediato.

Gestión de inventario:
- Para consultar stock usá consultar_stock.
- Para entrada de mercancía usá ajustar_stock con type "entry".
- Para corrección por conteo físico usá ajustar_stock con type "adjustment".
- Para editar nombre, precio o umbral de un producto usá actualizar_producto.`;

/**
 * Strips SDK-specific fields (refusal, index, etc.) so the message
 * is safe to send back to the API in subsequent turns.
 */
function toApiMessage(msg) {
  if (msg.role === 'user' || msg.role === 'system') {
    return { role: msg.role, content: msg.content };
  }
  if (msg.role === 'assistant') {
    const clean = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) {
      clean.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    return clean;
  }
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.tool_call_id,
      content: String(msg.content ?? ''),
    };
  }
  return msg;
}

/**
 * Runs the GPT-4o Mini agent with function calling.
 * Handles multi-turn tool calls in a single request cycle.
 */
async function runAgent(userText, session, waNumber) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...session.messages.map(toApiMessage),
    { role: 'user', content: userText },
  ];

  let finalReply = '';

  // Loop to handle chained tool calls
  for (let i = 0; i < 5; i++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      finalReply = choice.message.content;
      break;
    }

    if (choice.finish_reason === 'tool_calls') {
      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = await handleTool(tc.function.name, args, session, waNumber);
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          };
        })
      );

      messages.push(...toolResults);
      continue;
    }

    break;
  }

  // Persist conversation (exclude system prompt), normalized to safe format
  session.messages = messages
    .filter((m) => m.role !== 'system')
    .map(toApiMessage);

  return { reply: finalReply, updatedSession: session };
}

module.exports = { runAgent };
