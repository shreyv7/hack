import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ComplianceGauge } from '@/app/components/ui/ComplianceGauge';
import { PenaltyChip } from '@/app/components/ui/PenaltyChip';
import type { GovernanceWidget, WidgetMetrics } from '@/types/governanceDashboard';
import { Copy, Download, MoreVertical, RefreshCw, Trash2 } from 'lucide-react';

interface WidgetRendererProps {
  widget: GovernanceWidget;
  metrics?: WidgetMetrics;
  editMode?: boolean;
  onRefresh?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'var(--status-success)',
  danger: 'var(--status-danger)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
};

export function WidgetRenderer({
  widget,
  metrics,
  editMode,
  onRefresh,
  onDuplicate,
  onDelete,
  onExport,
}: WidgetRendererProps): ReactElement {
  const navigate = useNavigate();
  const data = metrics?.data ?? {};
  const route = metrics?.route_paths?.module;
  const layout = widget.layout_json;
  const colSpan = layout?.col_span ?? 4;
  const showOrgWideBadge =
    Boolean(data.bu_filter_active) && data.bu_scoped === false;

  const shell = (children: React.ReactNode) => (
    <div
      className={`col-span-${colSpan} p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/50 text-[var(--text-primary)] relative group`}
      style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium truncate">{widget.title}</h3>
          {showOrgWideBadge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 whitespace-nowrap">
              Org-wide
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRefresh && (
            <button type="button" onClick={onRefresh} className="p-1 rounded hover:bg-[var(--surface-card)]" title="Refresh">
              <RefreshCw className="size-3.5" />
            </button>
          )}
          {editMode && onDuplicate && (
            <button type="button" onClick={onDuplicate} className="p-1 rounded hover:bg-[var(--surface-card)]" title="Duplicate">
              <Copy className="size-3.5" />
            </button>
          )}
          {onExport && (
            <button type="button" onClick={onExport} className="p-1 rounded hover:bg-[var(--surface-card)]" title="Export">
              <Download className="size-3.5" />
            </button>
          )}
          {editMode && onDelete && (
            <button type="button" onClick={onDelete} className="p-1 rounded hover:bg-[var(--surface-card)] text-[var(--status-danger)]" title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          )}
          {route && (
            <button type="button" onClick={() => navigate(route)} className="p-1 rounded hover:bg-[var(--surface-card)]" title="Drill down">
              <MoreVertical className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );

  switch (widget.widget_type) {
    case 'compliance_card':
      return shell(
        <div className="flex flex-col items-center">
          <ComplianceGauge score={Number(data.score ?? 0)} size={120} />
          <div className="text-center mt-2 text-sm text-[var(--text-secondary)] capitalize">
            {String(data.trend_direction ?? data.status ?? '')}
          </div>
        </div>
      );
    case 'kpi_card':
      if (widget.data_source === 'compliance_score') {
        return shell(
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <PenaltyChip amount={Number(data.penalty_mitigated_crores ?? 0)} className="mb-2" />
              <div className="text-xs text-[var(--status-success)] font-medium">
                {data.score_delta_week != null ? `${Number(data.score_delta_week) >= 0 ? '↑' : '↓'} ${Math.abs(Number(data.score_delta_week))}% from last week` : ''}
              </div>
            </div>
          </div>
        );
      }
      if (widget.data_source === 'breach') {
        const counts = (data.active_incidents as Record<string, number>) ?? {};
        return shell(
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)] capitalize">{k}</span>
                <span className={`text-2xl font-semibold text-[var(--status-${k === 'critical' ? 'danger' : k === 'high' ? 'warning' : 'info'})]`}>
                  {counts[k] ?? 0}
                </span>
              </div>
            ))}
          </div>
        );
      }
      if (widget.data_source === 'ropa') {
        const metricKey = (widget.config_json as { metric_key?: string })?.metric_key;
        const ropaMetrics: Record<string, unknown> = {
          without_channel: data.without_channel,
          without_data_source: data.without_data_source,
          without_retention_link: data.without_retention_link,
          without_dpia: data.without_dpia,
          total_activities: data.total_activities,
          completion_pct: data.completion_pct,
          high_risk_activities: data.high_risk_activities,
        };
        if (metricKey && ropaMetrics[metricKey] !== undefined) {
          return shell(<div className="text-3xl font-semibold">{String(ropaMetrics[metricKey])}</div>);
        }
        return shell(
          <div className="text-3xl font-semibold">{String(data.total_activities ?? '—')}</div>
        );
      }
      if (widget.data_source === 'retention') {
        return shell(
          <div className="space-y-1">
            <div className="text-3xl font-semibold">{String(data.records_deleted_total ?? 0)}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {String(data.obligations_due ?? 0)} obligations due · §{String(data.dpdpa_section ?? '8(7)')}
            </div>
          </div>
        );
      }
      if (widget.data_source === 'data_sources') {
        return shell(
          <div className="space-y-1">
            <div className="text-3xl font-semibold">{String(data.total_sources ?? 0)}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {String(data.discovery_only ?? 0)} discovery · {String(data.read_write ?? 0)} read/write
            </div>
          </div>
        );
      }
      return shell(<div className="text-3xl font-semibold">{String(data.consent_rate ?? data.total_records ?? '—')}</div>);
    case 'donut_chart':
    case 'pie_chart': {
      const slices = (data.sla_performance as Array<{ name: string; value: number; color: string }>) ?? [];
      return shell(
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={widget.widget_type === 'donut_chart' ? 60 : 0} outerRadius={80} dataKey="value">
              {slices.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.color] ?? 'var(--brand-primary)'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case 'line_chart': {
      const trend = (data.trend as Array<{ month: string; rate?: number }>) ?? [];
      return shell(
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
            <Area type="monotone" dataKey="rate" stroke="var(--brand-primary)" fill="var(--brand-primary)" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    case 'bar_chart': {
      const metricKey = (widget.config_json as { metric_key?: string })?.metric_key;
      if (widget.data_source === 'ropa' && metricKey === 'by_channel') {
        const byChannel = (data.by_channel as Record<string, number>) ?? {};
        const chartData = Object.entries(byChannel).map(([channel, count]) => ({
          channel: channel.replace(/_/g, ' '),
          count,
        }));
        return shell(
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
              <XAxis dataKey="channel" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
              <Bar dataKey="count" name="Activities" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      }
      const trend = (data.trend as Array<{ month: string; incidents: number; resolved: number }>) ?? [];
      return shell(
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="incidents" name="Total Incidents" fill="var(--status-danger)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill="var(--status-success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case 'scorecard': {
      const modules = (data.modules as Array<{ section: string; health: number; status: string; route_path?: string }>) ?? [];
      return shell(
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {modules.map((item) => (
            <button
              key={item.section}
              type="button"
              onClick={() => item.route_path && navigate(item.route_path)}
              className="p-3 rounded bg-[var(--surface-card)] border border-[var(--border-default)] text-left hover:border-[var(--brand-primary)] cursor-pointer"
            >
              <div className="text-xs text-[var(--text-secondary)] mb-1">{item.section}</div>
              <div className={`text-2xl font-semibold ${item.health >= 80 ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'}`}>
                {item.health}%
              </div>
            </button>
          ))}
        </div>
      );
    }
    case 'table': {
      const rows = (data.recent as Array<{ id: string; title: string; severity: string }>) ?? [];
      return shell(
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between p-2 bg-[var(--surface-card)] rounded border border-[var(--border-default)] text-sm cursor-pointer hover:bg-[var(--surface-raised)]"
              onClick={() => route && navigate(route)}
            >
              <span className="font-mono text-xs">{row.id}</span>
              <span className="text-[var(--text-secondary)] truncate mx-2">{row.title}</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--status-warning-bg)] text-[var(--status-warning)]">{row.severity}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'deadlines': {
      const items = (data.deadlines as Array<{ title: string; due_at: string; route_path?: string }>) ?? [];
      return shell(
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.title + item.due_at}
              className="p-2 bg-[var(--surface-card)] rounded border border-[var(--border-default)] text-sm cursor-pointer hover:bg-[var(--surface-raised)]"
              onClick={() => item.route_path && navigate(item.route_path)}
            >
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-[var(--text-secondary)]">Due: {new Date(item.due_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'progress_bar': {
      const pct = Number(data.progress_pct ?? data.completion_pct ?? data.completion_rate ?? 0);
      const label = String(data.label ?? widget.title);
      return shell(
        <div>
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
            <span>{label}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-card)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
          {widget.data_source === 'retention' && (
            <div className="text-xs text-[var(--text-tertiary)] mt-2">
              {String(data.pending_confirmations ?? 0)} pending confirmations · {String(data.records_flagged ?? 0)} flagged
            </div>
          )}
        </div>
      );
    }
    case 'ai_summary':
      return shell(
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          AI-generated executive summary based on live compliance posture across all integrated modules.
        </p>
      );
    default:
      return shell(<div className="text-sm text-[var(--text-tertiary)]">Widget data loading…</div>);
  }
}
