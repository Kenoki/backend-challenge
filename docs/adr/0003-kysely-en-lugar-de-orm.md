# SQL tipado con Kysely en lugar de un ORM

La pasada de envío necesita `SELECT … FOR UPDATE SKIP LOCKED`, updates condicionales sobre el claim e `INSERT … ON CONFLICT DO NOTHING`, que los ORM (Prisma, TypeORM) expresan mal o con SQL crudo sin tipos. Usamos Kysely sobre `pg`: es SQL explícito y tipado, y las migraciones corren al arrancar. Solo se usa en `infrastructure/`, detrás de los puertos de repositorio y del `UnitOfWork`, así que cambiarlo no toca el dominio ni los casos de uso.
