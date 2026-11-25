# Reprogramar conserva los recordatorios ya enviados

El enunciado dice que, al reprogramar, el recordatorio pendiente pasa a `cancelled` y se crea otro "aunque el anterior ya se hubiera enviado". Lo interpretamos así: solo se cancelan los recordatorios `pending`, los `sent` se conservan tal cual y siempre se crea uno nuevo para la nueva hora. Marcar como cancelado un mensaje que ya se entregó falsearía el historial de la cita (`reminders` puede quedar `[sent, pending]`).
