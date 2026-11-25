/** Hora del servicio. Todo lo que necesite "ahora" la recibe inyectada (el lease usa el reloj de la base, no este). */
export interface Clock {
  now(): Date;
}
