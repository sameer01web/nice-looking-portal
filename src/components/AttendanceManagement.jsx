import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Save,
  Search,
  Filter,
  Users,
  Eye,
  X,
  History,
  Sun,
  Moon,
  Coffee
} from "lucide-react";
import {
  fetchEmployees,
  fetchAttendanceForDate,
  saveAttendanceBatch,
  fetchSalonPayrollSettings,
  saveSalonPayrollSettings,
  fetchMonthlyAttendanceForEmployee
} from "../lib/dataService";
import { getMumbaiTodayISO } from "../lib/supabase";

const STATUS_CONFIG = {
  PRESENT: { label: "Present", color: "#16a34a", bg: "#dcfce7", border: "#86efac", icon: "✓" },
  ABSENT: { label: "Absent", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", icon: "✕" },
  HALF_DAY: { label: "Half Day", color: "#d97706", bg: "#fef3c7", border: "#fde68a", icon: "½" },
  PAID_LEAVE: { label: "Paid Leave", color: "#0284c7", bg: "#e0f2fe", border: "#7dd3fc", icon: "🏖️" },
  UNPAID_LEAVE: { label: "Unpaid Leave", color: "#be123c", bg: "#ffe4e6", border: "#fecdd3", icon: "🚫" },
  WEEKLY_OFF: { label: "Weekly Off", color: "#7e22ce", bg: "#f3e8ff", border: "#d8b4fe", icon: "☕" },
  HOLIDAY: { label: "Holiday", color: "#b45309", bg: "#ffedd5", border: "#fed7aa", icon: "🎉" }
};

export default function AttendanceManagement({
  salonId = "default",
  actorInfo = null,
  currentSalon = null,
  setHeaderAction = null
}) {
  const todayISO = useMemo(() => getMumbaiTodayISO(), []);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [payrollSettings, setPayrollSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedEmployeeForCalendar, setSelectedEmployeeForCalendar] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => todayISO.slice(0, 7));
  const [employeeMonthlyAttendance, setEmployeeMonthlyAttendance] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Settings form state
  const [shiftStart, setShiftStart] = useState("10:00");
  const [shiftEnd, setShiftEnd] = useState("20:00");
  const [gracePeriod, setGracePeriod] = useState(15);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empList, attList, settings] = await Promise.all([
        fetchEmployees(salonId),
        fetchAttendanceForDate(selectedDate, salonId),
        fetchSalonPayrollSettings(salonId)
      ]);

      const activeEmployees = (empList || []).filter(e => e.status === "ACTIVE");
      setEmployees(activeEmployees);
      setPayrollSettings(settings);
      setShiftStart(settings.openingTime?.slice(0, 5) || "10:00");
      setShiftEnd(settings.closingTime?.slice(0, 5) || "20:00");
      setGracePeriod(settings.gracePeriodMinutes ?? 15);

      // Build map from existing records or defaults
      const map = {};
      activeEmployees.forEach(emp => {
        const found = attList.find(a => String(a.employeeId) === String(emp.id));
        if (found) {
          map[emp.id] = {
            id: found.id,
            employeeId: emp.id,
            attendanceDate: selectedDate,
            status: found.status,
            checkIn: found.checkIn || "",
            checkOut: found.checkOut || "",
            workingHours: found.workingHours || 0,
            overtimeHours: found.overtimeHours || 0,
            notes: found.notes || "",
            isLate: found.isLate,
            lateMinutes: found.lateMinutes
          };
        } else {
          // Default unrecorded entry: prompt owner to select
          map[emp.id] = {
            employeeId: emp.id,
            attendanceDate: selectedDate,
            status: "PRESENT",
            checkIn: settings.openingTime?.slice(0, 5) || "10:00",
            checkOut: settings.closingTime?.slice(0, 5) || "20:00",
            workingHours: 8,
            overtimeHours: 0,
            notes: "",
            isLate: false,
            lateMinutes: 0
          };
        }
      });
      setAttendanceMap(map);
    } catch (err) {
      console.error("Attendance load error:", err);
    } finally {
      setLoading(false);
    }
  }, [salonId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set Topbar Header Action button
  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn secondary small-btn"
          type="button"
          onClick={() => setShowSettingsModal(true)}
          title="Configure Shift Timings & Grace Period"
        >
          <Clock size={14} /> <span>Shift Settings</span>
        </button>
      );
    }
  }, [setHeaderAction]);

  // Update specific field for employee attendance
  const updateAttendance = (empId, field, val) => {
    setAttendanceMap(prev => {
      const current = prev[empId] || { employeeId: empId, attendanceDate: selectedDate, status: "PRESENT" };
      const updated = { ...current, [field]: val };

      // Auto compute working hours when in and out are present
      if (field === "checkIn" || field === "checkOut") {
        const cIn = field === "checkIn" ? val : updated.checkIn;
        const cOut = field === "checkOut" ? val : updated.checkOut;
        if (cIn && cOut) {
          try {
            const [inH, inM] = cIn.split(":").map(Number);
            const [outH, outM] = cOut.split(":").map(Number);
            const diffMin = (outH * 60 + outM) - (inH * 60 + inM);
            if (diffMin > 0) {
              updated.workingHours = Number((diffMin / 60).toFixed(1));
              // Compute overtime if hours exceed 9
              if (updated.workingHours > 8.5) {
                updated.overtimeHours = Number((updated.workingHours - 8).toFixed(1));
              } else {
                updated.overtimeHours = 0;
              }
            }
          } catch {}
        }
      }

      // Check late arrival
      if (field === "checkIn" && shiftStart) {
        try {
          const [inH, inM] = val.split(":").map(Number);
          const [openH, openM] = shiftStart.split(":").map(Number);
          const diffMinutes = (inH * 60 + inM) - (openH * 60 + openM);
          if (diffMinutes > gracePeriod) {
            updated.isLate = true;
            updated.lateMinutes = diffMinutes;
          } else {
            updated.isLate = false;
            updated.lateMinutes = 0;
          }
        } catch {}
      }

      // Adjust hours based on status
      if (field === "status") {
        if (val === "ABSENT" || val === "UNPAID_LEAVE" || val === "WEEKLY_OFF" || val === "HOLIDAY") {
          updated.workingHours = 0;
          updated.overtimeHours = 0;
          updated.checkIn = "";
          updated.checkOut = "";
        } else if (val === "HALF_DAY") {
          updated.workingHours = 4;
        } else if (val === "PRESENT" && (!updated.checkIn || !updated.checkOut)) {
          updated.checkIn = shiftStart;
          updated.checkOut = shiftEnd;
          updated.workingHours = 8;
        }
      }

      return { ...prev, [empId]: updated };
    });
  };

  // Quick Action: Mark All Present
  const markAllPresent = () => {
    setAttendanceMap(prev => {
      const next = { ...prev };
      employees.forEach(emp => {
        next[emp.id] = {
          ...(next[emp.id] || {}),
          employeeId: emp.id,
          attendanceDate: selectedDate,
          status: "PRESENT",
          checkIn: shiftStart,
          checkOut: shiftEnd,
          workingHours: 8,
          overtimeHours: 0,
          isLate: false,
          lateMinutes: 0
        };
      });
      return next;
    });
  };

  // Quick Action: Mark All Weekly Off
  const markAllWeeklyOff = () => {
    setAttendanceMap(prev => {
      const next = { ...prev };
      employees.forEach(emp => {
        next[emp.id] = {
          ...(next[emp.id] || {}),
          employeeId: emp.id,
          attendanceDate: selectedDate,
          status: "WEEKLY_OFF",
          checkIn: "",
          checkOut: "",
          workingHours: 0,
          overtimeHours: 0
        };
      });
      return next;
    });
  };

  // Save Attendance to database
  const handleSaveAttendance = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const recordsToSave = Object.values(attendanceMap);
      await saveAttendanceBatch(recordsToSave, actorInfo, salonId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      loadData();
    } catch (err) {
      alert("Failed to save attendance: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Salon Shift Timings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveSalonPayrollSettings({
        openingTime: `${shiftStart}:00`,
        closingTime: `${shiftEnd}:00`,
        gracePeriodMinutes: Number(gracePeriod)
      }, actorInfo, salonId);
      setShowSettingsModal(false);
      loadData();
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Open Monthly Attendance Calendar for an employee
  const openEmployeeCalendar = async (emp) => {
    setSelectedEmployeeForCalendar(emp);
    setLoadingCalendar(true);
    try {
      const records = await fetchMonthlyAttendanceForEmployee(emp.id, calendarMonth, salonId);
      setEmployeeMonthlyAttendance(records || []);
    } catch (err) {
      console.error("Monthly attendance error:", err);
    } finally {
      setLoadingCalendar(false);
    }
  };

  // Navigate calendar month
  const changeCalendarMonth = async (direction) => {
    const [y, m] = calendarMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setCalendarMonth(nextMonth);
    if (selectedEmployeeForCalendar) {
      setLoadingCalendar(true);
      try {
        const records = await fetchMonthlyAttendanceForEmployee(selectedEmployeeForCalendar.id, nextMonth, salonId);
        setEmployeeMonthlyAttendance(records || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCalendar(false);
      }
    }
  };

  // Computed Date Attendance Metrics
  const dateMetrics = useMemo(() => {
    const list = Object.values(attendanceMap);
    return {
      present: list.filter(a => a.status === "PRESENT").length,
      halfDay: list.filter(a => a.status === "HALF_DAY").length,
      absent: list.filter(a => a.status === "ABSENT").length,
      paidLeave: list.filter(a => a.status === "PAID_LEAVE").length,
      unpaidLeave: list.filter(a => a.status === "UNPAID_LEAVE").length,
      weeklyOff: list.filter(a => a.status === "WEEKLY_OFF").length,
      holiday: list.filter(a => a.status === "HOLIDAY").length,
      lateCount: list.filter(a => a.isLate).length
    };
  }, [attendanceMap]);

  // Filtered list of employees for the table
  const displayedEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter(emp => {
      const att = attendanceMap[emp.id];
      if (statusFilter !== "ALL" && att?.status !== statusFilter) return false;
      if (!q) return true;
      const str = `${emp.name} ${emp.mobile} ${emp.jobRole} ${att?.notes || ""}`.toLowerCase();
      return str.includes(q);
    });
  }, [employees, attendanceMap, search, statusFilter]);

  // Change selected date
  const changeDateBy = (offset) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d + offset);
    setSelectedDate(dt.toISOString().slice(0, 10));
  };

  return (
    <div className="attendance-mgmt-container">
      {/* Date Navigation & Control Bar */}
      <div className="panel" style={{ padding: "14px 18px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => changeDateBy(-1)}
                title="Previous Day"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                className="date-input"
                style={{ fontSize: "14px", fontWeight: 700, padding: "6px 12px" }}
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => changeDateBy(1)}
                title="Next Day"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {selectedDate === todayISO ? (
              <span className="pill success" style={{ fontWeight: 700 }}>
                📅 Today (Mumbai)
              </span>
            ) : (
              <button
                type="button"
                className="period-chip"
                onClick={() => setSelectedDate(todayISO)}
              >
                Jump to Today
              </button>
            )}

            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Shift: <strong>{shiftStart} – {shiftEnd}</strong> (Grace: {gracePeriod}m)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary small-btn"
              onClick={markAllPresent}
              title="Quickly set all staff to Present"
            >
              ✓ All Present
            </button>
            <button
              type="button"
              className="btn secondary small-btn"
              onClick={markAllWeeklyOff}
              title="Set all staff to Weekly Off (e.g. Monday)"
            >
              ☕ All Weekly Off
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: "#16a34a", borderColor: "#15803d", fontWeight: 700 }}
              onClick={handleSaveAttendance}
              disabled={saving}
            >
              <Save size={16} />
              <span>{saving ? "Saving Roster..." : "Save Daily Attendance"}</span>
            </button>
          </div>
        </div>

        {/* Date Attendance Metrics Pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <span className="summary-sub-badge" style={{ background: "#dcfce7", color: "#15803d", borderColor: "#bbf7d0", fontWeight: 700 }}>
            ✓ Present: {dateMetrics.present}
          </span>
          <span className="summary-sub-badge" style={{ background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }}>
            ½ Half Day: {dateMetrics.halfDay}
          </span>
          <span className="summary-sub-badge" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", fontWeight: 700 }}>
            ✕ Absent: {dateMetrics.absent}
          </span>
          <span className="summary-sub-badge" style={{ background: "#e0f2fe", color: "#0369a1", borderColor: "#bae6fd" }}>
            🏖️ Paid Leave: {dateMetrics.paidLeave}
          </span>
          <span className="summary-sub-badge" style={{ background: "#ffe4e6", color: "#be123c", borderColor: "#fecdd3" }}>
            🚫 Unpaid: {dateMetrics.unpaidLeave}
          </span>
          <span className="summary-sub-badge" style={{ background: "#f3e8ff", color: "#7e22ce", borderColor: "#e9d5ff" }}>
            ☕ Off: {dateMetrics.weeklyOff}
          </span>
          {dateMetrics.lateCount > 0 && (
            <span className="summary-sub-badge" style={{ background: "#ffedd5", color: "#c2410c", borderColor: "#fed7aa", fontWeight: 700 }}>
              ⚠️ Late Arrivals: {dateMetrics.lateCount}
            </span>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="alert success" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle size={18} />
          <span>Attendance records successfully saved and audited for {selectedDate}.</span>
        </div>
      )}

      {/* Main Attendance Table Panel */}
      <section className="panel">
        <div className="invoices-filter-bar">
          <div className="invoices-search-status-row">
            <div className="search">
              <Search size={17} />
              <input
                type="text"
                placeholder="Search staff by name or job role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div style={{ display: "flex", gap: "4px", overflowX: "auto", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`discount-chip ${statusFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                All Staff ({employees.length})
              </button>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={`discount-chip ${statusFilter === key ? "active" : ""}`}
                  onClick={() => setStatusFilter(key)}
                >
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Attendance Table */}
        <div className="table-wrap desktop-only-table" style={{ marginTop: "12px" }}>
          <table>
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Attendance Status</th>
                <th>Check-In</th>
                <th>Check-Out</th>
                <th>Working Hours</th>
                <th>Late Flag</th>
                <th>Notes / Remarks</th>
                <th style={{ textAlign: "right" }}>Monthly Record</th>
              </tr>
            </thead>
            <tbody>
              {displayedEmployees.length ? (
                displayedEmployees.map(emp => {
                  const att = attendanceMap[emp.id] || { status: "PRESENT", checkIn: shiftStart, checkOut: shiftEnd, workingHours: 8 };
                  const cfg = STATUS_CONFIG[att.status] || STATUS_CONFIG.PRESENT;

                  return (
                    <tr key={emp.id} style={att.status === "ABSENT" ? { background: "#fef2f2" } : {}}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "50%",
                              background: cfg.bg,
                              color: cfg.color,
                              fontWeight: 800,
                              display: "grid",
                              placeItems: "center",
                              fontSize: "12.5px"
                            }}
                          >
                            {(emp.name || "E").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong>{emp.name}</strong>
                            <small style={{ display: "block", color: "#64748b" }}>
                              {emp.jobRole} • {emp.salaryType === "MONTHLY" ? "Monthly" : "Wage"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="status-select"
                          value={att.status}
                          onChange={e => updateAttendance(emp.id, "status", e.target.value)}
                          style={{
                            fontWeight: 700,
                            padding: "6px 10px",
                            borderRadius: "7px",
                            border: `1.5px solid ${cfg.border}`,
                            background: cfg.bg,
                            color: cfg.color,
                            cursor: "pointer"
                          }}
                        >
                          {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                            <option key={k} value={k}>
                              {c.icon} {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {att.status === "PRESENT" || att.status === "HALF_DAY" ? (
                          <input
                            type="time"
                            className="time-input"
                            value={att.checkIn || ""}
                            onChange={e => updateAttendance(emp.id, "checkIn", e.target.value)}
                            style={{ padding: "4px 8px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        {att.status === "PRESENT" || att.status === "HALF_DAY" ? (
                          <input
                            type="time"
                            className="time-input"
                            value={att.checkOut || ""}
                            onChange={e => updateAttendance(emp.id, "checkOut", e.target.value)}
                            style={{ padding: "4px 8px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={att.workingHours ?? ""}
                            onChange={e => updateAttendance(emp.id, "workingHours", Number(e.target.value))}
                            style={{ width: "65px", padding: "4px 6px", fontSize: "12.5px", textAlign: "center", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                            disabled={att.status === "ABSENT" || att.status === "UNPAID_LEAVE" || att.status === "WEEKLY_OFF"}
                          />
                          <span style={{ fontSize: "11px", color: "#64748b" }}>hrs</span>
                        </div>
                      </td>
                      <td>
                        {att.isLate ? (
                          <span className="pill danger" style={{ fontSize: "11px", fontWeight: 700 }}>
                            Late ({att.lateMinutes}m)
                          </span>
                        ) : att.status === "PRESENT" && att.checkIn ? (
                          <span className="pill success" style={{ fontSize: "11px" }}>
                            On Time
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Optional notes..."
                          value={att.notes || ""}
                          onChange={e => updateAttendance(emp.id, "notes", e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "12px", width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0" }}
                        />
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn secondary small-btn"
                            onClick={() => openEmployeeCalendar(emp)}
                            title="View Employee Monthly Calendar"
                          >
                            <Calendar size={13} /> Month Log
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="empty-cell">
                    {loading ? "Loading attendance..." : "No active staff found for attendance."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Card View */}
        <div className="mobile-only-cards mobile-card-list" style={{ marginTop: "12px" }}>
          {displayedEmployees.length ? (
            displayedEmployees.map(emp => {
              const att = attendanceMap[emp.id] || { status: "PRESENT", checkIn: shiftStart, checkOut: shiftEnd, workingHours: 8 };
              const cfg = STATUS_CONFIG[att.status] || STATUS_CONFIG.PRESENT;

              return (
                <div
                  className="mobile-card"
                  key={emp.id}
                  style={{ borderLeft: `4px solid ${cfg.color}` }}
                >
                  <div className="mobile-card-header">
                    <div>
                      <h4 className="mobile-card-title">{emp.name}</h4>
                      <span className="mobile-card-sub">{emp.jobRole}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="icon-action-btn view-action"
                        onClick={() => openEmployeeCalendar(emp)}
                        title="View Monthly Calendar"
                      >
                        <Calendar size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mobile-card-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>Status:</span>
                      <select
                        value={att.status}
                        onChange={e => updateAttendance(emp.id, "status", e.target.value)}
                        style={{
                          fontWeight: 700,
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: `1.5px solid ${cfg.border}`,
                          background: cfg.bg,
                          color: cfg.color
                        }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                          <option key={k} value={k}>
                            {c.icon} {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(att.status === "PRESENT" || att.status === "HALF_DAY") && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", alignItems: "center" }}>
                        <div>
                          <label style={{ fontSize: "10.5px", color: "#64748b", margin: "0 0 2px 0", display: "block" }}>Check-In</label>
                          <input
                            type="time"
                            value={att.checkIn || ""}
                            onChange={e => updateAttendance(emp.id, "checkIn", e.target.value)}
                            style={{ width: "100%", padding: "4px", fontSize: "11px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "10.5px", color: "#64748b", margin: "0 0 2px 0", display: "block" }}>Check-Out</label>
                          <input
                            type="time"
                            value={att.checkOut || ""}
                            onChange={e => updateAttendance(emp.id, "checkOut", e.target.value)}
                            style={{ width: "100%", padding: "4px", fontSize: "11px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "10.5px", color: "#64748b", margin: "0 0 2px 0", display: "block" }}>Hours</label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={att.workingHours ?? ""}
                            onChange={e => updateAttendance(emp.id, "workingHours", Number(e.target.value))}
                            style={{ width: "100%", padding: "4px", fontSize: "11px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                          />
                        </div>
                      </div>
                    )}

                    {att.isLate && (
                      <div style={{ fontSize: "11px", color: "#c2410c", fontWeight: 700 }}>
                        ⚠️ Late Arrival by {att.lateMinutes} minutes
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Remarks / Notes..."
                      value={att.notes || ""}
                      onChange={e => updateAttendance(emp.id, "notes", e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "11.5px", width: "100%", borderRadius: "5px", border: "1px solid #e2e8f0" }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-cell">
              No staff members found.
            </div>
          )}
        </div>
      </section>

      {/* Monthly Attendance Calendar Modal */}
      {selectedEmployeeForCalendar && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedEmployeeForCalendar(null);
          }}
        >
          <div className="modal" style={{ maxWidth: "660px" }}>
            <div className="sheet-handle" />
            <div className="modal-head">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                  <CalendarCheck size={19} style={{ color: "var(--blue)" }} />
                  <span>{selectedEmployeeForCalendar.name} — Attendance History</span>
                </h3>
                <small style={{ color: "#64748b" }}>
                  {selectedEmployeeForCalendar.jobRole} • {selectedEmployeeForCalendar.salaryType}
                </small>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedEmployeeForCalendar(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Month Switcher */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0", background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() => changeCalendarMonth(-1)}
              >
                <ChevronLeft size={15} /> Prev Month
              </button>
              <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                {new Date(calendarMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </strong>
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() => changeCalendarMonth(1)}
              >
                Next Month <ChevronRight size={15} />
              </button>
            </div>

            {/* Monthly Calendar Grid */}
            {loadingCalendar ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#64748b" }}>
                Loading attendance history...
              </div>
            ) : (
              <div>
                {/* Monthly Summary Badges */}
                {(() => {
                  const presentCount = employeeMonthlyAttendance.filter(a => a.status === "PRESENT").length;
                  const halfDayCount = employeeMonthlyAttendance.filter(a => a.status === "HALF_DAY").length;
                  const absentCount = employeeMonthlyAttendance.filter(a => a.status === "ABSENT").length;
                  const paidLeaveCount = employeeMonthlyAttendance.filter(a => a.status === "PAID_LEAVE").length;
                  const unpaidLeaveCount = employeeMonthlyAttendance.filter(a => a.status === "UNPAID_LEAVE").length;
                  const offCount = employeeMonthlyAttendance.filter(a => a.status === "WEEKLY_OFF").length;
                  const totalPayable = presentCount + (halfDayCount * 0.5) + paidLeaveCount;

                  return (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                      <span className="pill success">Present: {presentCount}d</span>
                      <span className="pill warning">Half-Day: {halfDayCount}d</span>
                      <span className="pill danger">Absent: {absentCount}d</span>
                      <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1" }}>Paid Leave: {paidLeaveCount}d</span>
                      <span className="pill" style={{ background: "#ffe4e6", color: "#be123c" }}>Unpaid: {unpaidLeaveCount}d</span>
                      <span className="pill" style={{ background: "#f3e8ff", color: "#7e22ce" }}>Off: {offCount}d</span>
                      <span className="pill" style={{ background: "#ecfdf5", color: "#047857", fontWeight: 800 }}>Payable Days: {totalPayable}d</span>
                    </div>
                  );
                })()}

                {/* Day-by-Day Calendar Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(75px, 1fr))", gap: "6px", maxHeight: "320px", overflowY: "auto", padding: "2px" }}>
                  {Array.from({ length: new Date(Number(calendarMonth.split("-")[0]), Number(calendarMonth.split("-")[1]), 0).getDate() }, (_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${calendarMonth}-${String(dayNum).padStart(2, "0")}`;
                    const att = employeeMonthlyAttendance.find(a => a.attendanceDate === dateStr);
                    const cfg = att ? (STATUS_CONFIG[att.status] || STATUS_CONFIG.PRESENT) : null;

                    return (
                      <div
                        key={dateStr}
                        style={{
                          background: cfg ? cfg.bg : "#f8fafc",
                          border: `1px solid ${cfg ? cfg.border : "#e2e8f0"}`,
                          borderRadius: "7px",
                          padding: "6px",
                          textAlign: "center"
                        }}
                      >
                        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#1e293b" }}>
                          {dayNum}
                        </div>
                        {cfg ? (
                          <>
                            <div style={{ fontSize: "10px", fontWeight: 800, color: cfg.color, marginTop: "2px" }}>
                              {cfg.icon} {cfg.label.slice(0, 7)}
                            </div>
                            {att.workingHours > 0 && (
                              <div style={{ fontSize: "9.5px", color: "#64748b" }}>
                                {att.workingHours}h
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                            —
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelectedEmployeeForCalendar(null)}
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salon Shift Timings Settings Modal */}
      {showSettingsModal && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !savingSettings) setShowSettingsModal(false);
          }}
        >
          <div className="modal" style={{ maxWidth: "480px", width: "95%", padding: "20px" }}>
            <div className="sheet-handle" />
            <div className="modal-head" style={{ paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "17px" }}>
                <Clock size={19} style={{ color: "var(--blue)" }} />
                <span>Salon Shift & Late Arrival Rules</span>
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowSettingsModal(false)}
                disabled={savingSettings}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="responsive-modal-form" style={{ marginTop: "16px" }}>
              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label">
                    Shift Opening Time
                  </label>
                  <input
                    type="time"
                    className="form-control"
                    required
                    value={shiftStart}
                    onChange={e => setShiftStart(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Shift Closing Time
                  </label>
                  <input
                    type="time"
                    className="form-control"
                    required
                    value={shiftEnd}
                    onChange={e => setShiftEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "14px" }}>
                <label className="form-label">
                  Late Arrival Grace Period (Minutes)
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="form-control"
                    min="0"
                    max="120"
                    required
                    value={gracePeriod}
                    onChange={e => setGracePeriod(Number(e.target.value))}
                    placeholder="15"
                  />
                  <span className="input-unit-label">Minutes</span>
                </div>
                <div className="form-help-box" style={{ marginTop: "10px" }}>
                  <span>⏱️ Check-ins past <strong>Opening Time + Grace Period</strong> will be marked as "Late".</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowSettingsModal(false)}
                  disabled={savingSettings}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingSettings}
                >
                  {savingSettings ? "Saving Settings..." : "Save Shift Rules"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

