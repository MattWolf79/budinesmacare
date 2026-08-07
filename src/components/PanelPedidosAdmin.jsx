import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { formatDisplayDate } from '../utils/dateFormat';
import MetricCard from './MetricCard';

const pad = (value) => String(value).padStart(2, '0');

const formatHora = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatFecha = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return formatDisplayDate(date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatMoneda = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isClosedBooking = (booking) => ['completed', 'closed'].includes(String(booking?.status || '').trim().toLowerCase());
const isCancelledBooking = (booking) => ['cancelled', 'canceled', 'cancelado', 'cancelada'].includes(String(booking?.status || '').trim().toLowerCase());

const getBookingMonetaryValue = (booking, precioUnitario = 0) => {
  const itemPrice = Number(booking?.item_price || 0);
  if (itemPrice > 0) return itemPrice;

  const totalAmount = Number(booking?.total_amount || 0);
  if (totalAmount > 0) return totalAmount;

  const price = Number(booking?.price || 0);
  if (price > 0) return price;

  const precioProducto = Number(precioUnitario || 0);
  if (precioProducto > 0) return precioProducto * parseLineQuantity(booking, precioProducto);

  return 0;
};

const getIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseLineQuantity = (booking, unitPrice = 0) => {
  const explicit = Number(booking?.item_quantity || booking?.quantity || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = String(booking?.booking_description || '');
  const match = text.match(/(?:^|\s)x(\d+)(?:\s|$)/i);
  if (match?.[1]) return Math.max(1, Number(match[1]));
  const lineAmount = Number(booking?.item_price || booking?.total_amount || booking?.price || 0);
  if (Number(unitPrice) > 0 && lineAmount > 0) {
    return Math.max(1, Math.round(lineAmount / Number(unitPrice)));
  }
  return 1;
};

const bookingGroupKey = (booking) => {
  if (booking?.booking_group_id) return `group:${booking.booking_group_id}`;
  if (booking?.group_id) return `group:${booking.group_id}`;
  const created = String(booking?.created_at || booking?.start_at || '').slice(0, 19);
  const customer = String(booking?.customer_name || booking?.user_email || 'anon').trim().toLowerCase();
  const branch = String(booking?.branch_id || 'sin-branch');
  return `fallback:${customer}|${created}|${branch}`;
};

const extractAddonsFromDescription = (descriptionValue) => {
  const text = String(descriptionValue || '');
  const marker = 'Agregados:';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return [];

  const raw = text.slice(markerIndex + marker.length).trim();
  if (!raw) return [];

  return raw
    .split('|')
    .map((chunk) => String(chunk || '').trim())
    .filter(Boolean)
    .map((chunk) => {
      const cleaned = chunk.replace(/\s+/g, ' ').trim();
      const qtyMatch = cleaned.match(/\bx(\d+)\b/i);
      const unitPriceMatch = cleaned.match(/\(\s*\$\s*([\d.,]+)\s*c\/u\s*\)/i);

      const quantity = qtyMatch?.[1] ? Math.max(1, Number(qtyMatch[1])) : 1;
      const unitPrice = unitPriceMatch?.[1]
        ? Number(String(unitPriceMatch[1]).replace(/\./g, '').replace(',', '.')) || 0
        : 0;

      let name = cleaned.replace(/\(\s*\$\s*[\d.,]+\s*c\/u\s*\)/i, '').replace(/\bx\d+\b/i, '').trim();
      if (!name) name = 'Agregado';

      return { name, quantity, unitPrice };
    });
};

const stripAddonsFromDescription = (descriptionValue) => {
  const text = String(descriptionValue || '').trim();
  const marker = 'Agregados:';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return text;
  return text.slice(0, markerIndex).replace(/[·\-\s]+$/, '').trim();
};

const splitCatalogName = (value) => {
  const raw = String(value || '').trim();
  if (!raw.includes('::')) {
    return { type: 'General', product: raw || 'Producto' };
  }
  const [typeRaw, ...rest] = raw.split('::');
  return {
    type: String(typeRaw || '').trim() || 'General',
    product: rest.join('::').trim() || raw
  };
};

export default function PanelPedidosAdmin({ user, companySlug, adminProfileSummary = null }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [offsetDias, setOffsetDias] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fechaSeleccionada = useMemo(() => addDays(new Date(), offsetDias), [offsetDias]);
  const isoFechaSeleccionada = useMemo(() => getIsoDate(fechaSeleccionada), [fechaSeleccionada]);

  useEffect(() => {
    let active = true;

    const cargarPedidos = async () => {
      setIsLoading(true);
      setError('');

      if (user?.isLocalInternal) {
        const now = new Date();
        const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 20, 0, 0).toISOString();
        const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0, 0).toISOString();
        const d3 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 30, 0, 0).toISOString();

        if (!active) return;

        setServices([
          { id: 1, name: 'Empanada de carne' },
          { id: 2, name: 'Pizza muzarella' }
        ]);
        setEmployees([{ id: 'emp-local', name: 'empleadolocal', first_name: 'Empleado', last_name: 'Local' }]);
        setBranches([{ id: 'branch-local', name: 'Sucursal Centro' }]);
        setBookings([
          {
            id: 'book-local-1',
            service: 1,
            booking_description: 'Empanada de carne · x6 · salsa criolla',
            customer_name: 'Martina Perez',
            user_email: 'martina@example.com',
            created_at: d1,
            start_at: d2,
            end_at: d3,
            branch_id: 'branch-local',
            employee_id: 'emp-local',
            item_price: 12500,
            status: 'reserved'
          }
        ]);
        setIsLoading(false);
        return;
      }

      const { data, error: adminError } = await supabase.rpc('get_admin_panel_data', {
        account_id_value: user?.isInternal ? user.id : null,
        session_token_value: user?.isInternal ? user.sessionToken : null,
        request_status_value: null,
        company_slug_value: companySlug
      });

      if (!active) return;

      if (adminError) {
        setBookings([]);
        setServices([]);
        setEmployees([]);
        setBranches([]);
        setError(adminError.message || 'No se pudo cargar el listado de pedidos.');
        setIsLoading(false);
        return;
      }

      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
      setServices(Array.isArray(data?.services) ? data.services : []);
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
      setBranches(Array.isArray(data?.branches) ? data.branches : []);
      setIsLoading(false);
    };

    cargarPedidos();

    return () => {
      active = false;
    };
  }, [companySlug, user]);

  const serviceNameById = useMemo(() => {
    const map = new Map();
    services.forEach((service) => {
      map.set(String(service.id), service.name || 'Producto');
    });
    return map;
  }, [services]);

  const servicePriceById = useMemo(() => {
    const map = new Map();
    services.forEach((service) => {
      map.set(String(service.id), Number(service.base_price || service.price || 0));
    });
    return map;
  }, [services]);

  const employeeNameById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const full = [employee.first_name, employee.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
      map.set(String(employee.id), full || employee.name || 'Sin asignar');
    });
    return map;
  }, [employees]);

  const branchNameById = useMemo(() => {
    const map = new Map();
    branches.forEach((branch) => {
      map.set(String(branch.id), branch.name || 'Sucursal');
    });
    return map;
  }, [branches]);

  const pedidosDelDia = useMemo(() => {
    const rows = bookings
      .filter((booking) => !isCancelledBooking(booking))
      .filter((booking) => {
        const date = new Date(booking.start_at || booking.created_at);
        if (Number.isNaN(date.getTime())) return false;
        return getIsoDate(date) === isoFechaSeleccionada;
      })
      .sort((a, b) => new Date(a.start_at || a.created_at) - new Date(b.start_at || b.created_at));

    return rows;
  }, [bookings, isoFechaSeleccionada]);

  const pedidosAgrupadosDelDia = useMemo(() => {
    const grouped = new Map();
    pedidosDelDia.forEach((booking) => {
      const key = bookingGroupKey(booking);
      const current = grouped.get(key) || {
        id: key,
        key,
        bookingGroupId: booking.booking_group_id || booking.group_id || null,
        lines: [],
        createdAt: booking.created_at || booking.start_at,
        startAt: booking.start_at,
        endAt: booking.end_at,
        customerName: booking.customer_name || booking.user_email || 'Cliente sin nombre',
        branchId: booking.branch_id || null,
        status: booking.status,
        totalAmount: 0,
        totalQuantity: 0
      };

      const unitPrice = servicePriceById.get(String(booking.service)) || 0;
      const lineQuantity = parseLineQuantity(booking, unitPrice);
      const lineAmount = getBookingMonetaryValue(booking, unitPrice);
      current.lines.push(booking);
      current.totalAmount += lineAmount;
      current.totalQuantity += lineQuantity;

      const currentStart = new Date(current.startAt || booking.start_at || booking.created_at || 0).getTime();
      const bookingStart = new Date(booking.start_at || booking.created_at || 0).getTime();
      if (!Number.isNaN(bookingStart) && (Number.isNaN(currentStart) || bookingStart < currentStart)) {
        current.startAt = booking.start_at || booking.created_at;
      }

      const currentEnd = new Date(current.endAt || booking.end_at || booking.start_at || 0).getTime();
      const bookingEnd = new Date(booking.end_at || booking.start_at || booking.created_at || 0).getTime();
      if (!Number.isNaN(bookingEnd) && (Number.isNaN(currentEnd) || bookingEnd > currentEnd)) {
        current.endAt = booking.end_at || booking.start_at || booking.created_at;
      }

      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((a, b) => new Date(a.startAt || a.createdAt) - new Date(b.startAt || b.createdAt));
  }, [pedidosDelDia, servicePriceById]);

  const pedidosNoCancelados = useMemo(
    () => bookings.filter((booking) => !isCancelledBooking(booking)),
    [bookings]
  );

  const pedidosCerrados = useMemo(
    () => pedidosNoCancelados.filter((booking) => isClosedBooking(booking)),
    [pedidosNoCancelados]
  );

  const valorTotalPedidos = useMemo(
    () => pedidosNoCancelados.reduce((total, booking) => {
      const unitPrice = servicePriceById.get(String(booking.service)) || 0;
      return total + getBookingMonetaryValue(booking, unitPrice);
    }, 0),
    [pedidosNoCancelados, servicePriceById]
  );

  const valorTotalDiaSeleccionado = useMemo(
    () => pedidosDelDia.reduce((total, booking) => {
      const unitPrice = servicePriceById.get(String(booking.service)) || 0;
      return total + getBookingMonetaryValue(booking, unitPrice);
    }, 0),
    [pedidosDelDia, servicePriceById]
  );

  const selectedOrderGroupedByType = useMemo(() => {
    if (!selectedOrder) return [];
    const grouped = new Map();
    selectedOrder.lines.forEach((booking) => {
      const serviceName = serviceNameById.get(String(booking.service)) || 'Producto';
      const parsed = splitCatalogName(serviceName);
      const unitPrice = servicePriceById.get(String(booking.service)) || 0;
      const quantity = parseLineQuantity(booking, unitPrice);
      const amount = getBookingMonetaryValue(booking, unitPrice);

      const bucket = grouped.get(parsed.type) || {
        type: parsed.type,
        lines: [],
        totalQuantity: 0,
        totalAmount: 0
      };

      bucket.lines.push({
        booking,
        product: parsed.product,
        quantity,
        amount,
        detail: stripAddonsFromDescription(booking.booking_description)
      });
      bucket.totalQuantity += quantity;
      bucket.totalAmount += amount;
      grouped.set(parsed.type, bucket);
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.type.localeCompare(b.type, 'es'))
      .map((group) => ({
        ...group,
        lines: group.lines.sort((a, b) => a.product.localeCompare(b.product, 'es'))
      }));
  }, [selectedOrder, serviceNameById, servicePriceById]);

  const selectedOrderAddons = useMemo(() => {
    if (!selectedOrder) return [];

    const rawAddons = selectedOrder.lines.flatMap((booking) => extractAddonsFromDescription(booking.booking_description));
    if (rawAddons.length === 0) return [];

    const grouped = new Map();
    rawAddons.forEach((addon) => {
      const key = `${addon.name}::${addon.unitPrice}`;
      const current = grouped.get(key) || { ...addon };
      current.quantity += grouped.has(key) ? addon.quantity : 0;
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [selectedOrder]);

  return (
    <section className="employee-panel">
      {adminProfileSummary && (
        <div className="admin-page-heading">
          <div>
            <h1>Pedidos</h1>
            <p>Seguimiento diario de pedidos y detalle de productos por cliente.</p>
          </div>
          {adminProfileSummary}
        </div>
      )}

      <div className="employee-summary-grid">
        <MetricCard label="Pedidos" value={pedidosNoCancelados.length} hint="totales no cancelados" />
        <MetricCard label="Cerrados" value={pedidosCerrados.length} hint="pedidos finalizados" />
        <MetricCard label="Pedidos del día" value={pedidosDelDia.length} hint={formatFecha(fechaSeleccionada)} />
        <MetricCard label="Valor total" value={formatMoneda(valorTotalPedidos)} hint="suma histórica de pedidos" />
        <MetricCard label="Valor del día" value={formatMoneda(valorTotalDiaSeleccionado)} hint={formatFecha(fechaSeleccionada)} />
      </div>

      <article className="employee-card">
        <div className="employee-card-header employee-upcoming-header">
          <div className="employee-upcoming-header-top">
            <div>
              <p className="admin-kicker">Pedidos</p>
              <h2>Listado por día</h2>
            </div>
            <button className="admin-link-button employee-upcoming-refresh" type="button" onClick={() => setOffsetDias(0)} title="Ir a hoy">
              Hoy
            </button>
          </div>

          <div className="employee-upcoming-date-filter" aria-label="Navegación por día">
            <button type="button" className="employee-date-nav" onClick={() => setOffsetDias((value) => value - 1)} aria-label="Día anterior" title="Día anterior">‹</button>
            <button type="button" className="employee-date-chip is-selected" onClick={() => {}}>
              <span className="employee-date-chip-day">{formatFecha(fechaSeleccionada)}</span>
            </button>
            <button type="button" className="employee-date-nav" onClick={() => setOffsetDias((value) => value + 1)} aria-label="Día siguiente" title="Día siguiente">›</button>
          </div>
        </div>

        <div className="employee-upcoming-list">
          {isLoading && <div className="employee-empty-line">Cargando pedidos...</div>}
          {!isLoading && error && <div className="employee-empty-line">{error}</div>}
          {!isLoading && !error && pedidosAgrupadosDelDia.length === 0 && <div className="employee-empty-line">No hay pedidos para este día.</div>}

          {!isLoading && !error && pedidosAgrupadosDelDia.map((order) => {
            const branchName = branchNameById.get(String(order.branchId)) || '';
            const lineLabel = order.lines.length === 1 ? '1 producto' : `${order.lines.length} productos`;

            return (
              <div className="employee-upcoming-row" key={order.id}>
                <div className="employee-upcoming-row-main order-row-main" style={{ cursor: 'default' }}>
                  <span className="employee-upcoming-row-info">
                    <span className="employee-upcoming-row-title">Pedido #{String(order.id).replace(/^group:|^fallback:/, '').slice(0, 10).toUpperCase()}</span>
                    <span className="employee-upcoming-row-client">{order.customerName}</span>
                    <span className="employee-upcoming-row-date">
                      Creado {formatHora(order.createdAt)} hs · Entrega {formatHora(order.startAt)} hs
                    </span>
                    <span className="employee-upcoming-row-date">{lineLabel} · Cantidad total: {order.totalQuantity}</span>
                    {branchName && <span className="employee-upcoming-row-date">Sucursal: {branchName}</span>}
                  </span>
                  <span className="employee-upcoming-row-badges">
                    <button
                      type="button"
                      className="employee-upcoming-row-kind employee-upcoming-row-kind-servicio"
                      onClick={() => setSelectedOrder(order)}
                      title="Visualizar detalle"
                    >
                      Visualizar
                    </button>
                    <span className="employee-upcoming-row-kind employee-upcoming-row-total">Total: {formatMoneda(order.totalAmount)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </article>

      {selectedOrder && (
        <div className="new-booking-modal" role="dialog" aria-modal="true">
          <div className="new-booking-modal-card">
            <header className="new-booking-modal-header">
              <h3>Detalle del pedido</h3>
              <button type="button" onClick={() => setSelectedOrder(null)} aria-label="Cerrar">✕</button>
            </header>
            <div className="new-booking-modal-body">
              <p className="employee-upcoming-row-date"><strong>Cliente:</strong> {selectedOrder.customerName}</p>
              <p className="employee-upcoming-row-date"><strong>Entrega:</strong> {formatFecha(selectedOrder.startAt)} {formatHora(selectedOrder.startAt)} hs</p>
              {branchNameById.get(String(selectedOrder.branchId || '')) && (
                <p className="employee-upcoming-row-date"><strong>Sucursal:</strong> {branchNameById.get(String(selectedOrder.branchId || ''))}</p>
              )}

              <div className="new-booking-product-list" style={{ marginTop: 8 }}>
                {selectedOrderGroupedByType.map((group) => (
                  <div key={group.type} className="new-booking-product-group">
                    <span className="new-booking-modal-group-title">{group.type}</span>
                    <div className="new-booking-product-list">
                      {group.lines.map((line) => (
                        <div key={line.booking.id} className="new-booking-product-row">
                          <div className="new-booking-product-main">
                            <strong>{line.product}</strong>
                            <span>{line.detail || 'Sin detalle'}</span>
                          </div>
                          <div className="new-booking-product-subtotal" style={{ textAlign: 'left', color: '#334155', fontSize: 13 }}>
                            x{line.quantity}
                          </div>
                          <div className="new-booking-product-subtotal">{formatMoneda(line.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {selectedOrderAddons.length > 0 && (
                <div className="new-booking-confirm-addons" style={{ marginTop: 2 }}>
                  <p className="new-booking-confirm-addons-title">Agregados</p>
                  <ul>
                    {selectedOrderAddons.map((addon, index) => {
                      const subtotal = addon.unitPrice > 0 ? addon.unitPrice * addon.quantity : 0;
                      return (
                        <li key={`${addon.name}-${addon.unitPrice}-${index}`}>
                          <span>{addon.name}</span>
                          <strong>
                            x{addon.quantity}
                            {subtotal > 0 ? ` · ${formatMoneda(subtotal)}` : ''}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="new-booking-product-footer">
                <div>
                  <span>Cantidad total de productos</span>
                  <strong>{selectedOrder.totalQuantity}</strong>
                </div>
                <div>
                  <span>Total del pedido</span>
                  <strong>{formatMoneda(selectedOrder.totalAmount)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
