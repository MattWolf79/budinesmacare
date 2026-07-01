import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyBlock = {
  startDate: '',
  endDate: '',
  startTime: '08:00',
  endTime: '18:00',
  fullDay: true,
  reason: ''
};

const pad = (value) => String(value).padStart(2, '0');

const formatDateForDb = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
);

const formatDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatTimeInput = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const getTodayInput = () => formatDateInput(new Date());

const getNowTimeInput = () => formatTimeInput(new Date());

const isSameDateValue = (dateValue, date) => dateValue === formatDateInput(date);

const parseLocalDateTime = (dateValue, timeValue) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const buildBlockRange = (blockForm) => {
  const startDate = blockForm.startDate;
  const endDate = blockForm.endDate || blockForm.startDate;

  if (!startDate) return null;

  if (blockForm.fullDay) {
    const start = parseLocalDateTime(startDate, '00:00');
    const end = parseLocalDateTime(endDate, '00:00');
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  return {
    start: parseLocalDateTime(startDate, blockForm.startTime),
    end: parseLocalDateTime(endDate, blockForm.endTime)
  };
};

const formatBlockLabel = (block) => {
  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  return `${start.toLocaleDateString()} ${pad(start.getHours())}:${pad(start.getMinutes())} - ${end.toLocaleDateString()} ${pad(end.getHours())}:${pad(end.getMinutes())}`;
};

export default function EmployeeBlocksPanel({ user, employeeId, employeeName, initialBlocks = [], onBlocksChanged }) {
  const [employeeBlocks, setEmployeeBlocks] = useState(initialBlocks);
  const [blockForm, setBlockForm] = useState(emptyBlock);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const upcomingBlocks = useMemo(() => {
    const now = new Date();
    return employeeBlocks.filter((block) => new Date(block.end_at) >= now);
  }, [employeeBlocks]);

  const loadBlocks = useCallback(async () => {
    if (!employeeId) return;

    setIsLoading(true);

    const result = user?.isInternal
      ? await supabase.rpc('list_internal_employee_blocks', { account_id_value: user.id })
      : await supabase
          .from('employee_blocks')
          .select('*')
          .eq('employee_id', employeeId)
          .order('start_at', { ascending: true });

    if (result.error) {
      alert(`No se pudieron cargar los bloqueos: ${result.error.message}`);
      setIsLoading(false);
      return;
    }

    setEmployeeBlocks(result.data || []);
    setIsLoading(false);
  }, [employeeId, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadBlocks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadBlocks]);

  const resetBlockForm = () => {
    setBlockForm(emptyBlock);
    setEditingBlockId(null);
  };

  const updateBlockField = (field, value) => {
    setBlockForm((current) => {
      if (field === 'startDate') {
        const shouldMoveEndDate = !current.endDate || current.endDate < value;

        return {
          ...current,
          startDate: value,
          endDate: shouldMoveEndDate ? value : current.endDate
        };
      }

      return { ...current, [field]: value };
    });
  };

  const editBlock = (block) => {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    const fullDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 0 && end.getMinutes() === 0;
    const endDate = new Date(end);

    if (fullDay) {
      endDate.setDate(endDate.getDate() - 1);
    }

    setEditingBlockId(block.id);
    setBlockForm({
      startDate: formatDateInput(start),
      endDate: formatDateInput(endDate),
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      fullDay,
      reason: block.reason || ''
    });
  };

  const saveBlock = async (event) => {
    event.preventDefault();

    const range = buildBlockRange(blockForm);

    if (!range) {
      alert('Ingresá la fecha del bloqueo.');
      return;
    }

    if (range.end <= range.start) {
      alert('El fin del bloqueo debe ser posterior al inicio.');
      return;
    }

    if (range.start < new Date()) {
      alert('No se pueden crear bloqueos en fechas u horarios que ya pasaron.');
      return;
    }

    const payload = {
      employee_id: employeeId,
      start_at: formatDateForDb(range.start),
      end_at: formatDateForDb(range.end),
      reason: blockForm.reason.trim() || null
    };

    const hasOverlap = employeeBlocks.some((block) => {
      if (String(block.id) === String(editingBlockId)) return false;
      return new Date(block.start_at) < range.end && new Date(block.end_at) > range.start;
    });

    if (hasOverlap) {
      alert('Ya tenés un bloqueo superpuesto en ese rango.');
      return;
    }

    setIsSaving(true);

    const result = user?.isInternal
      ? editingBlockId
        ? await supabase.rpc('update_internal_employee_block', {
            account_id_value: user.id,
          block_id_value: String(editingBlockId),
            start_at_value: payload.start_at,
            end_at_value: payload.end_at,
            reason_value: payload.reason
          })
        : await supabase.rpc('create_internal_employee_block', {
            account_id_value: user.id,
            start_at_value: payload.start_at,
            end_at_value: payload.end_at,
            reason_value: payload.reason
          })
      : editingBlockId
        ? await supabase
            .from('employee_blocks')
            .update(payload)
            .eq('id', editingBlockId)
            .eq('employee_id', employeeId)
        : await supabase
            .from('employee_blocks')
            .insert(payload)
            .select('*')
            .single();

    if (result.error) {
      alert(`No se pudo guardar el bloqueo: ${result.error.message}`);
      setIsSaving(false);
      return;
    }

    resetBlockForm();
    await loadBlocks();
    onBlocksChanged?.();
    setIsSaving(false);
  };

  const deleteBlock = async (block) => {
    const shouldDelete = window.confirm('¿Eliminar este bloqueo de tu agenda?');
    if (!shouldDelete) return;

    setIsSaving(true);

    const result = user?.isInternal
      ? await supabase.rpc('delete_internal_employee_block', {
          account_id_value: user.id,
          block_id_value: String(block.id)
        })
      : await supabase
          .from('employee_blocks')
          .delete()
          .eq('id', block.id)
          .eq('employee_id', employeeId);

    if (result.error) {
      alert(`No se pudo eliminar el bloqueo: ${result.error.message}`);
      setIsSaving(false);
      return;
    }

    if (editingBlockId === block.id) resetBlockForm();
    await loadBlocks();
    onBlocksChanged?.();
    setIsSaving(false);
  };

  const todayInput = getTodayInput();
  const currentTimeInput = getNowTimeInput();
  const endDateMin = blockForm.startDate || todayInput;
  const startTimeMin = !blockForm.fullDay && isSameDateValue(blockForm.startDate, new Date())
    ? currentTimeInput
    : undefined;
  const endTimeMin = !blockForm.fullDay && blockForm.endDate === blockForm.startDate
    ? blockForm.startTime
    : undefined;

  return (
    <section className="admin-shell employee-block-manager">
      <div className="admin-hero">
        <div>
          <span className="admin-kicker">Disponibilidad</span>
          <h1>Bloqueos</h1>
        </div>
        <button className="agenda-close-button admin-refresh-button" type="button" onClick={loadBlocks} disabled={isLoading}>
          Actualizar
        </button>
      </div>

      <div className="admin-layout">
        <form className="agenda-modal-card admin-form-card" onSubmit={saveBlock}>
          <div className="agenda-modal-header">{editingBlockId ? 'Editar bloqueo' : 'Nuevo bloqueo'}</div>
          <div className="agenda-modal-body admin-form-grid">
            <label>
              Empleado
              <input value={employeeName || 'Mi agenda'} disabled />
            </label>

            <label className="admin-switch-row">
              <input type="checkbox" checked={blockForm.fullDay} onChange={(event) => updateBlockField('fullDay', event.target.checked)} />
              Día completo
            </label>

            <div className="admin-two-columns">
              <label>
                Desde
                <input type="date" min={todayInput} value={blockForm.startDate} onChange={(event) => updateBlockField('startDate', event.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" min={endDateMin} value={blockForm.endDate} onChange={(event) => updateBlockField('endDate', event.target.value)} />
              </label>
            </div>

            {!blockForm.fullDay && (
              <div className="admin-two-columns">
                <label>
                  Hora inicio
                  <input type="time" min={startTimeMin} value={blockForm.startTime} onChange={(event) => updateBlockField('startTime', event.target.value)} />
                </label>
                <label>
                  Hora fin
                  <input type="time" min={endTimeMin} value={blockForm.endTime} onChange={(event) => updateBlockField('endTime', event.target.value)} />
                </label>
              </div>
            )}

            <label>
              Motivo
              <input value={blockForm.reason} onChange={(event) => updateBlockField('reason', event.target.value)} placeholder="Trámite personal, vacaciones..." />
            </label>

            <div className="admin-actions">
              <button className="agenda-close-button" type="submit" disabled={isSaving}>
                {editingBlockId ? 'Guardar' : 'Crear'}
              </button>
              {editingBlockId && (
                <button className="agenda-option-button" type="button" onClick={resetBlockForm} disabled={isSaving}>
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="admin-list">
          {isLoading ? (
            <div className="agenda-modal-card admin-form-card">
              <div className="agenda-modal-header">Cargando</div>
              <div className="agenda-modal-body agenda-empty-state">Buscando bloqueos...</div>
            </div>
          ) : upcomingBlocks.length === 0 ? (
            <div className="agenda-modal-card admin-form-card">
              <div className="agenda-modal-header">Sin bloqueos</div>
              <div className="agenda-modal-body agenda-empty-state">No tenés bloqueos programados.</div>
            </div>
          ) : upcomingBlocks.map((block) => (
            <article className="admin-record-card admin-record-card-plain" key={block.id}>
              <div className="admin-record-main">
                <div className="admin-record-title">{block.reason || 'Bloqueo de agenda'}</div>
                <div className="admin-record-meta">{formatBlockLabel(block)}</div>
                <div className="admin-record-services">No disponible para reservas en este rango</div>
              </div>
              <div className="admin-record-actions">
                <button className="agenda-close-button" type="button" onClick={() => editBlock(block)} disabled={isSaving}>Editar</button>
                <button className="agenda-danger-button" type="button" onClick={() => deleteBlock(block)} disabled={isSaving}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}