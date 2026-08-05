# Plan Empresa Pedidos V1 (sin impacto en Develop)

## 1) Objetivo

Definir una primera version del producto para empresas de tipo pedido, con el menor impacto posible en la app actual de turnos.

La estrategia acordada es:

- Reutilizar la entidad/logica actual de reservas (bookings) y adaptarla por tipo de operacion.
- No crear entidad nueva de pedidos en esta etapa.
- No usar grilla de agenda para Pedido.
- Exponer listado cronologico de pedidos para Admin y Empleado.

## 2) Decisiones cerradas

### Modelo de datos

- Decision: reutilizar la estructura actual de reservas.
- Se agrega tipo de operacion (turno o pedido) y campos complementarios para detalle de pedido.
- No se crea tabla separada de pedidos en esta fase.

### Servicios en modo Pedido (catalogo de productos)

- En empresas de pedido, el concepto Servicio se interpreta como Producto.
- La configuracion funcional esperada es por item con:
  - nombre de producto,
  - cantidad,
  - precio unitario.
- Ejemplo de negocio: empanada de carne, empanada de pollo, pizza muzarella (cada uno con cantidad y precio unitario).
- En esta etapa se conserva la base existente de servicios para minimizar impacto, cambiando semantica y etiquetas en UI para modo pedido.
- El modelo debe contemplar componentes adicionales por producto (opciones extra), por ejemplo:
  - comidas: aderezos o salsas,
  - juguetes: opcion de empaque (caja o bolsa).

### Experiencia Cliente

- En empresas de pedido, el cliente no ve grilla de agenda.
- La accion principal sera Hacer Pedido (en lugar de Nueva Reserva).
- Mis turnos pasa a Mis pedidos.

### Experiencia Empleado y Admin

- En empresas de pedido, se elimina la vista de grilla.
- Se incorpora vista Pedidos con listado cronologico.
- La vista debe mostrar:
  - hora de creacion del pedido,
  - hora/fecha comprometida (para cuando lo quieren),
  - detalle de pedido (items/cantidades),
  - monto final.
- Navegacion temporal: paginado por dia hacia atras y hacia adelante.

### Horario operativo

- Para esta etapa no se define logica avanzada de horarios comerciales.
- Se mantiene ventana actual 08:00 a 18:00 como base operativa.

## 3) Tipos de empresa (preset comercial)

Se mantiene el esquema comercial definido en Plataforma:

- Empresa Turno Cobro
- Empresa Turno Sin Cobro
- Empresa Pedido Cobro
- Empresa Pedido Sin Cobro

Nota: para evitar rigidez futura, estos tipos deben mapear a flags de capacidad (feature flags), no a logica hardcodeada por nombre.

## 4) Alcance MVP (primera entrega)

## Incluye

- Selector de tipo de empresa en Plataforma con presets de configuracion.
- Modo Pedido sin grilla para Cliente, Empleado y Admin.
- Renombre de etiquetas clave:
  - Nueva reserva -> Hacer pedido / Nuevo pedido
  - Mis turnos -> Mis pedidos
- Listado de pedidos por dia para Admin y Empleado.
- Configuracion de catalogo para modo pedido usando la estructura actual de servicios, tratada como productos.

## No incluye (por ahora)

- Entidad nueva de pedidos separada.
- Rediseno impositivo profundo.
- Reglas avanzadas de horario comercial dinamico.
- Logica de despacho/delivery compleja.

## 5) Diseno tecnico recomendado (bajo impacto)

### 5.1 Configuracion por empresa

Agregar/usar flags en configuracion_operativa (ejemplo):

- modo_operacion: turno | pedido
- usa_agenda: true | false
- usa_precios: true | false
- descuentos_habilitados: true | false
- recargos_habilitados: true | false
- permite_nueva_reserva: true | false (o equivalente para pedido)

Para empresas de pedido:

- modo_operacion = pedido
- usa_agenda = false

### 5.2 Reutilizacion de bookings

Extender la entidad actual con campos minimos para pedido (si faltan):

- operation_type: turno | pedido
- created_at (ya existe en la mayoria de flujos)
- requested_for_at (fecha/hora solicitada)
- order_detail (json/text con items: producto, cantidad, precio_unitario, subtotal y componentes/opciones)
- final_amount (o reutilizacion de campo monetario existente)

Nota: mantener compatibilidad con filtros y RPC actuales para no romper turnos.

Estructura orientativa de order_detail:

```json
[
  {
    "product_id": "svc_123",
    "product_name": "Empanada de carne",
    "quantity": 2,
    "unit_price": 1200,
    "line_total": 2400,
    "componentes": [
      {
        "componente_id": "cmp_aji",
        "nombre": "Salsa aji",
        "cantidad": 1,
        "precio_unitario": 0,
        "subtotal": 0
      }
    ]
  }
]
```

Nota: en MVP, los componentes pueden iniciar como opcionales sin logica compleja de stock, pero con estructura lista para crecer.

### 5.4 Convencion de nombres (obligatoria desde ahora)

- Todo objeto nuevo de desarrollo debe nombrarse en castellano:
  - tablas/columnas,
  - funciones/rpcs,
  - clases,
  - metodos,
  - variables,
  - componentes nuevos de UI.
- Si se reutiliza codigo existente en ingles, se mantiene para no romper compatibilidad; lo nuevo se crea en castellano.
- Objetivo: mejorar interpretacion funcional del equipo y reducir ambiguedad entre negocio y tecnica.

### 5.3 Navegacion y menus dinamicos

Centralizar definicion de menus por perfil segun configuracion_operativa:

- Cliente (pedido): Inicio, Hacer Pedido, Mis pedidos, Perfil
- Empleado (pedido): Resumen, Pedidos, Perfil
- Admin (pedido): Nuevo pedido, Pedidos, Clientes, Empleados, Configuracion

## 6) Plan de implementacion por fases

### Fase 0 - Preparacion

- Crear rama feature desde develop.
- No trabajar directo sobre develop.

### Fase 1 - Plataforma

- Agregar selector de tipo de empresa.
- Aplicar presets de flags al crear/editar empresa.

### Fase 2 - Cliente Pedido

- Reemplazar flujo de reserva por formulario de pedido (sin grilla).
- Renombrar etiquetas visibles.

### Fase 3 - Empleado/Admin Pedido

- Quitar acceso a grilla en modo pedido.
- Crear vista de listado cronologico con paginado por dia.
- Incluir detalle completo del pedido.

### Fase 4 - Ajustes de cobro

- Aplicar reglas Cobro/Sin Cobro por tipo de empresa.
- Ocultar campos no necesarios cuando no cobra.

## 7) Riesgos y mitigacion

- Riesgo: condicionamientos hardcodeados por rol/vista.
  - Mitigacion: resolver vistas por flags de empresa.

- Riesgo: romper flujos existentes de turnos.
  - Mitigacion: default conservador en modo turno y pruebas regresivas.

- Riesgo: mezcla de semantica turno/pedido en reportes.
  - Mitigacion: operation_type obligatorio para nuevos registros.

## 8) Criterios de aceptacion MVP

- Se puede crear empresa tipo Pedido Cobro y Pedido Sin Cobro desde Plataforma.
- Cliente no ve grilla y puede crear pedido.
- Empleado y Admin no ven grilla en modo pedido y operan desde listado de pedidos.
- Etiquetas de UI reflejan pedido (no turno) en empresas de pedido.
- En modo pedido, se puede configurar catalogo de productos reutilizando servicios y registrar pedidos con cantidad y precio unitario por item.
- En modo pedido, se pueden registrar componentes adicionales por item (ejemplo: salsa/aderezo, caja/bolsa).
- Empresas de turno siguen funcionando sin cambios visibles.

## 9) Estrategia de rama (obligatoria)

Cuando arranque la implementacion:

1. Crear rama feature desde develop.
2. Implementar todo en esa rama.
3. No hacer commits directos en develop.
4. Integrar por PR al finalizar validaciones.

Comandos sugeridos:

```bash
git checkout develop
git pull
git checkout -b feature/empresa-pedidos-v1
```

Nombre alternativo valido:

```bash
feature/tipos-empresa-pedidos
```

## 10) Siguiente paso sugerido

Antes de escribir codigo, cerrar una matriz simple Tipo de Empresa -> Flags para que Plataforma aplique presets de forma deterministica y testeable.
