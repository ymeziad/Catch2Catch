/** Spanish for the dashboard's fixed wording. Keys are the English text exactly as written in the code. */
export const ES: Record<string, string> = {
  // menu
  "Today": "Hoy", "Bills": "Facturas", "Problems": "Problemas", "Reminders": "Avisos", "Calls": "Llamadas", "Texts": "Mensajes",
  "More": "Más", "Books": "Libros", "History": "Historial", "Upload a call": "Subir una llamada",

  // shared
  "Loading…": "Cargando…", "Back": "Volver", "Save": "Guardar", "Never mind": "Mejor no", "OK": "Entendido", "Confirm": "Confirmar", "Cancel": "Cancelar",
  "You": "Usted", "Shop": "Tienda", "Warehouse": "Almacén", "House rules": "Reglas de la casa", "C2C AI": "IA de C2C",
  "and": "y", "did {n} other things": "hizo {n} cosas más",
  "1 day late": "1 día de retraso", "{n} days late": "{n} días de retraso", "due today": "vence hoy", "due {date}": "vence {date}",
  "Read it to me": "Léamelo", "Stop": "Parar", "The recording couldn't be played.": "No se pudo reproducir la grabación.",

  // today
  "Owed to you": "Le deben", "Money in, last 14 days": "Dinero recibido, últimos 14 días", "Who owes you": "Quién le debe",
  "Nobody owes you anything right now.": "Nadie le debe nada en este momento.", "Other": "Otros", "Late": "Atrasado", "Collected this week": "Cobrado esta semana",
  "{shop} is {late} paying their bill.": "{shop} lleva {late} con su pago.",
  "New problems and late bills will show up here.": "Aquí aparecerán los problemas nuevos y las facturas atrasadas.",

  // try it out
  "Try it out": "Pruébelo", "Date:": "Fecha:", "(+{n} days)": "(+{n} días)", "+1 day": "+1 día", "+7 days": "+7 días", "Back to today": "Volver a hoy",
  "New order:": "Pedido nuevo:", "Packed right": "Empacado bien", "Packed short": "Empacado incompleto", "Not scanned": "Sin escanear",
  "Making the order": "Creando el pedido", "Checking the text": "Revisando el mensaje",
  "Change their last order (as the shop)": "Cambiar su último pedido (como la tienda)",
  "Shop texts: missing 2 cases of Dr Pepper": "La tienda escribe: faltan 2 cajas de Dr Pepper", "Send as shop": "Enviar como la tienda",
  "No shops yet.": "Todavía no hay tiendas.",
  "This message isn’t allowed": "Este mensaje no está permitido", "This message isn’t about an order.": "Este mensaje no trata de un pedido.",
  "Texts need to be about an order, like a missing or damaged item.": "Los mensajes deben tratar de un pedido, como un producto que falta o llegó dañado.",

  // bills
  "Not paid yet": "Sin pagar", "Everyone is paid up.": "Todos están al día.", "On hold because of a problem": "En espera por un problema",
  "Paid": "Pagado", "Settled": "Arreglado", "Other amount": "Otra cantidad", "Got paid": "Me pagaron", "How much they paid": "Cuánto pagaron",

  // problems
  "Waiting on you": "Esperando su decisión", "Nothing is waiting on you.": "No hay nada esperando su decisión.", "Sorted out": "Resueltos",
  "{shop} texted: “{message}”": "{shop} escribió: “{message}”",
  "{shop} paid less than they owe.": "{shop} pagó menos de lo que debe.",
  "{shop} has a problem with an order.": "{shop} tiene un problema con un pedido.",
  "We couldn’t find this problem.": "No encontramos este problema.",
  "C2C Suggestion:": "Sugerencia de C2C:", "Bill": "Factura", "Still owed": "Todavía debe",
  "Take {amount} off": "Descontar {amount}", "Refund {amount}": "Devolver {amount}", "Send it again": "Enviarlo otra vez", "Tell them no": "Decirles que no", "Decide": "Decidir",
  "Take {amount} off (bill not paid yet).": "Descontar {amount} (la factura aún no está pagada).",
  "Refund {amount} (bill already paid).": "Devolver {amount} (la factura ya está pagada).",
  "Send the missing items with the next delivery.": "Mandar lo que falta con la próxima entrega.",
  "Tell them no. What they're saying doesn't match our proof.": "Decirles que no. Lo que dicen no coincide con nuestras pruebas.",
  "It isn't sure about this one, so it's your call.": "No está segura en este caso, así que usted decide.",
  "It's still looking into this.": "Todavía lo está revisando.",
  "The {ai} is checking the call, the packing scan, and the payments…": "El {ai} está revisando la llamada, el escaneo del empaque y los pagos…",
  "This was handled automatically: it was a small amount, the shop has a clean record, and the packing scan proves it. A fixed rule made the call, not the AI.":
    "Esto se resolvió automáticamente: era una cantidad pequeña, la tienda tiene buen historial y el escaneo del empaque lo comprueba. Lo decidió una regla fija, no la IA.",
  "This message wasn’t about the order, so it was closed automatically and the shop was asked what was actually wrong.":
    "Este mensaje no trataba del pedido, así que se cerró automáticamente y se le preguntó a la tienda cuál era el problema.",
  "You said no on {date}.": "Usted dijo que no el {date}.", "You approved this on {date}.": "Usted lo aprobó el {date}.",
  "Do something else": "Hacer otra cosa", "No, leave it": "No, dejarlo así",
  "Take money off (bill not paid yet)": "Descontar dinero (factura sin pagar)", "Refund (bill already paid)": "Devolver dinero (factura ya pagada)",
  "How much?": "¿Cuánto?", "Add a note (optional)": "Agregar una nota (opcional)",
  "What they ordered and what we packed": "Lo que pidieron y lo que empacamos", "Item": "Producto", "Ordered": "Pedido", "Packed": "Empacado",
  "{n} missing": "faltan {n}", "{n} extra": "{n} de más",
  "Details": "Detalles", "The phone call": "La llamada", "There’s no recording for this order.": "No hay grabación de este pedido.",
  "The packing scan": "El escaneo del empaque", "Scanned by {name} on {date}.": "Escaneado por {name} el {date}.",
  "Nobody scanned the boxes for this order.": "Nadie escaneó las cajas de este pedido.", "Photo of the packed box": "Foto de la caja empacada",
  "{shop}’s record": "Historial de {shop}",
  "No other problems in the last 3 months.": "Ningún otro problema en los últimos 3 meses.",
  "1 other problem in the last 3 months.": "1 problema más en los últimos 3 meses.",
  "{n} other problems in the last 3 months.": "{n} problemas más en los últimos 3 meses.",
  "Problems up to {amount} are fixed automatically when the proof is clear and the shop has a clean record.":
    "Los problemas de hasta {amount} se arreglan automáticamente cuando las pruebas son claras y la tienda tiene buen historial.",
  "Ask the {ai} to check again": "Pedirle al {ai} que lo revise otra vez",
  "{shop} texted about the problem.": "{shop} escribió sobre el problema.",
  "{shop} paid less than the bill, so C2C texted them to ask why.": "{shop} pagó menos de la factura, así que C2C les escribió para preguntar por qué.",
  "{shop} sent another text.": "{shop} mandó otro mensaje.",
  "The {ai} looked into it and made a suggestion.": "El {ai} lo revisó e hizo una sugerencia.",
  "House rules handled it automatically.": "Las reglas de la casa lo resolvieron automáticamente.",
  "You said no.": "Usted dijo que no.", "Closed automatically: the message wasn’t about the order.": "Cerrado automáticamente: el mensaje no trataba del pedido.",
  "You approved it.": "Usted lo aprobó.", "It was carried out.": "Se llevó a cabo.",

  // shop page
  "We couldn’t find this shop.": "No encontramos esta tienda.", "C2C Summary:": "Resumen de C2C:",
  "Writing a summary of their track record…": "Escribiendo un resumen de su historial…",
  "Orders": "Pedidos", "Paid on time": "Pagado a tiempo", "Paid late": "Pagado tarde", "Purchases": "Compras", "No purchases yet.": "Todavía no hay compras.",
  "On hold: problem": "En espera: problema", "Paid 1 day late": "Pagado 1 día tarde", "Paid {n} days late": "Pagado {n} días tarde",
  "You said no": "Usted dijo que no", "Took {amount} off": "Se descontó {amount}", "Refunded {amount}": "Se devolvió {amount}",
  "Sent the items again": "Se mandaron los productos otra vez", "Told them no": "Se les dijo que no",

  // reminders
  "Coming up": "Próximos", "No reminders are scheduled.": "No hay recordatorios programados.", "Already handled": "Ya hechos", "the shop": "la tienda",
  "Ask {shop} to confirm their order": "Pedirle a {shop} que confirme su pedido",
  "Remind {shop} that payment is coming up": "Recordarle a {shop} que se acerca su pago",
  "Remind {shop} that payment is due today": "Recordarle a {shop} que su pago vence hoy",
  "Tell {shop} their payment is late": "Avisarle a {shop} que su pago está atrasado",
  "Let you know {shop} still hasn't paid": "Avisarle a usted que {shop} todavía no ha pagado",
  "not paid yet": "sin pagar", "part paid": "pagado en parte", "paid up": "al día", "problem": "problema", "all settled": "todo arreglado",
  "needs you": "lo necesita", "done": "hecho", "you said no": "usted dijo que no", "coming up": "próximo", "sent": "enviado", "stopped": "detenido",

  // books
  "Does it add up?": "¿Cuadran las cuentas?", "Yes, it adds up.": "Sí, cuadran.", "No, something is off.": "No, algo no cuadra.",
  "Account": "Cuenta", "In": "Entra", "Out": "Sale", "Balance": "Saldo", "Total": "Total", "Every entry": "Todos los movimientos",
  "Nothing has been written down yet.": "Todavía no hay nada anotado.",
  "Cash": "Efectivo", "Sales": "Ventas", "Taken off bills and refunds": "Descuentos y devoluciones",

  // history
  "Everyone": "Todos", "Search": "Buscar",
  "sent a bill": "mandó una factura",
  "reminded a shop that a payment is coming up": "le recordó a una tienda que se acerca un pago",
  "reminded a shop that a payment is due today": "le recordó a una tienda que un pago vence hoy",
  "told a shop their payment is late": "le avisó a una tienda que su pago está atrasado",
  "texted you about a bill that isn't getting paid": "le escribió sobre una factura que no se está pagando",
  "asked a shop to confirm their order": "le pidió a una tienda que confirmara su pedido",
  "noticed a short payment and asked the shop why": "notó un pago incompleto y le preguntó a la tienda por qué",
  "heard from a shop about a problem": "recibió el aviso de un problema de una tienda",
  "looked into a problem and suggested a fix": "revisó un problema y sugirió una solución",
  "fixed a small problem on its own": "arregló un problema pequeño por su cuenta",
  "updated an order a shop changed": "actualizó un pedido que cambió una tienda",
};
