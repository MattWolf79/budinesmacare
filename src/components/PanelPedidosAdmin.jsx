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

const getBookingMonetaryValue = (booking) => {
  const itemPrice = Number(booking?.item_price || 0);
  if (itemPrice > 0) return itemPrice;

  const totalAmount = Number(booking?.total_amount || 0);
  if (totalAmount > 0) return totalAmount;

  const price = Number(booking?.price || 0);
  if (price > 0) return price;

  return 0;
};

const getIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function PanelPedidosAdmin({ user, companySlug }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [offsetDias, setOffsetDias] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);

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
        setError(adminError.message || 'No se pudo cargar el listado de pedidos.');
        setIsLoading(false);
        return;
      }

      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
      setServices(Array.isArray(data?.services) ? data.services : []);
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
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

  const employeeNameById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const full = [employee.first_name, employee.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
      map.set(String(employee.id), full || employee.name || 'Sin asignar');
    });
    return map;
  }, [employees]);

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

  const pedidosNoCancelados = useMemo(
    () => bookings.filter((booking) => !isCancelledBooking(booking)),
    [bookings]
  );

  const pedidosCerrados = useMemo(
    () => pedidosNoCancelados.filter((booking) => isClosedBooking(booking)),
    [pedidosNoCancelados]
  );

  const valorTotalPedidos = useMemo(
    () => pedidosNoCancelados.reduce((total, booking) => total + getBookingMonetaryValue(booking), 0),
    [pedidosNoCancelados]
  );

  const valorTotalDiaSeleccionado = useMemo(
    () => pedidosDelDia.reduce((total, booking) => total + getBookingMonetaryValue(booking), 0),
    [pedidosDelDia]
  );

  return (
    <section className="employee-panel">
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
          {!isLoading && !error && pedidosDelDia.length === 0 && <div className="employee-empty-line">No hay pedidos para este día.</div>}

          {!isLoading && !error && pedidosDelDia.map((booking) => {
            const serviceName = serviceNameById.get(String(booking.service)) || 'Producto';
            const detail = String(booking.booking_description || '').trim();
            const employeeName = employeeNameById.get(String(booking.employee_id)) || 'Sin asignar';

            return (
              <div className="employee-upcoming-row" key={booking.id}>
                <div className="employee-upcoming-row-main" style={{ cursor: 'default' }}>
                  <span className="employee-upcoming-row-info">
                    <span className="employee-upcoming-row-title">{detail || serviceName}</span>
                    <span className="employee-upcoming-row-client">{booking.customer_name || booking.user_email || 'Cliente sin nombre'}</span>
                    <span className="employee-upcoming-row-date">
                      Creado {formatHora(booking.created_at)} hs · Entrega {formatHora(booking.start_at)} hs
                    </span>
                    <span className="employee-upcoming-row-date">Empleado: {employeeName}</span>
                    {Number(booking.item_price || 0) > 0 && <span className="employee-upcoming-row-date">Total: {formatMoneda(booking.item_price)}</span>}
                  </span>
                  <span className="employee-upcoming-row-badges">
                    <span className="employee-upcoming-row-kind employee-upcoming-row-kind-servicio">Pedido</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
