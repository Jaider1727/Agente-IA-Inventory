'use strict';

function formatCOP(amount) {
  return `$${Number(amount).toLocaleString('es-CO')}`;
}

module.exports = { formatCOP };
