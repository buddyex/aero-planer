const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('../config');
const authService = require('../services/auth.service');
const missionService = require('../services/mission.service');
const batteryService = require('../services/battery.service');
const droneService = require('../services/drone.service');
const sectorService = require('../services/sector.service');
const messageService = require('../services/message.service');
const operatorService = require('../services/operator.service');
const maintenanceService = require('../services/maintenance.service');
const dashboardService = require('../services/dashboard.service');
const systemService = require('../services/system.service');
const pdfService = require('../services/pdf.service');
const { requireAuth } = require('../middleware/auth');

function createApiRouter(io) {
  const router = express.Router();

  function emitMission(event, payload) {
    if (io) io.emit(event, payload);
  }

  function emitToRoles(roles, event, payload) {
    if (!io) return;
    for (const role of roles) {
      io.to(`role:${role}`).emit(event, payload);
    }
  }

  // Auth
  router.post('/auth/login', async (req, res, next) => {
    try {
      const { login, pin } = req.body ?? {};
      const result = await authService.loginOperator(login, pin);
      if (!result.ok) return res.status(401).json(result);

      res.cookie(config.jwt.refreshCookie, result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        ok: true,
        data: result.data,
        access_token: result.accessToken,
      });
    } catch (err) {
      if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ECONNREFUSED') {
        return res.status(503).json({
          ok: false,
          error: 'DB_UNAVAILABLE',
          message:
            'Не удалось подключиться к MySQL. Проверьте backend/.env (DB_USER, DB_PASSWORD) и что MySQL запущен.',
        });
      }
      next(err);
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res) => {
    await authService.logoutOperator(req.operatorId);
    res.clearCookie(config.jwt.refreshCookie);
    return res.json({ ok: true });
  });

  router.get('/auth/session', requireAuth, (req, res) => {
    res.json({ ok: true, data: req.user });
  });

  // Missions
  router.get('/missions', requireAuth, async (req, res) => {
    const result = await missionService.getMissions(req.operatorId, req.user.role);
    res.json(result);
  });

  router.post('/missions', requireAuth, async (req, res) => {
    const result = await missionService.createMission(req.body, req.operatorId, req.user.role);
    if (result.ok && result.notifyApproval) {
      emitToRoles(['Руководитель', 'Администратор'], 'notification:toast', {
        type: 'mission_pending',
        message: 'Новая миссия ожидает согласования',
        missionId: result.data.id,
      });
      emitMission('mission:created', result.data);
    }
    if (result.ok) emitMission('mission:statusChanged', result.data);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.put('/missions/:id/approve', requireAuth, async (req, res) => {
    const result = await missionService.approveMission(req.params.id, req.operatorId);
    if (result.ok) emitMission('mission:statusChanged', result.data);
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.put('/missions/:id/reject', requireAuth, async (req, res) => {
    const result = await missionService.rejectMission(req.params.id, req.operatorId);
    if (result.ok) emitMission('mission:statusChanged', result.data);
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.put('/missions/:id/status', requireAuth, async (req, res) => {
    const { status } = req.body ?? {};
    const result = await missionService.updateMissionStatus(
      req.params.id,
      status,
      req.operatorId,
      req.user.role,
    );
    if (result.ok) emitMission('mission:statusChanged', result.data);
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.put('/missions/:id', requireAuth, async (req, res) => {
    const result = await missionService.updateMission(
      req.params.id,
      req.body,
      req.operatorId,
      req.user.role,
    );
    if (result.ok) emitMission('mission:statusChanged', result.data);
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.get('/missions/:id/flight-sheet.pdf', requireAuth, async (req, res) => {
    try {
      const access = await missionService.assertMissionDocumentAccess(
        req.params.id,
        req.operatorId,
        req.user.role,
      );
      if (!access.ok) {
        return res.status(access.status || 403).json({ ok: false, error: access.error, message: access.error });
      }

      const pdf = await pdfService.buildFlightSheetPdf(req.params.id);
      if (!pdf) {
        return res.status(404).json({ ok: false, error: 'Миссия не найдена.', message: 'Миссия не найдена.' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="flight-sheet-${req.params.id}.pdf"`);
      return res.send(pdf);
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message, message: error.message });
    }
  });

  router.get('/missions/:id/kml', requireAuth, async (req, res) => {
    const access = await missionService.assertMissionDocumentAccess(
      req.params.id,
      req.operatorId,
      req.user.role,
    );
    if (!access.ok) {
      return res.status(access.status || 403).json({ ok: false, error: access.error, message: access.error });
    }

    const result = await sectorService.exportMissionKml(req.params.id);
    if (!result.ok) return res.status(404).json(result);
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', `attachment; filename="mission-${req.params.id}.kml"`);
    return res.send(result.data);
  });

  // Batteries
  router.get('/batteries/available', requireAuth, async (req, res) => {
    const result = await batteryService.getAvailableBatteries(req.user.role);
    res.json(result);
  });

  router.get('/batteries', requireAuth, async (req, res) => {
    const result = await batteryService.getAllBatteries(req.user.role);
    res.json(result);
  });

  router.post('/batteries', requireAuth, async (req, res) => {
    const { serial_number, type, capacity } = req.body ?? {};
    const result = await batteryService.addBattery(
      req.operatorId,
      req.user.role,
      serial_number,
      type,
      capacity,
    );
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.put('/batteries/:id/status', requireAuth, async (req, res) => {
    const result = await batteryService.updateBatteryStatus(
      req.operatorId,
      req.user.role,
      req.params.id,
      req.body?.status,
    );
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.get('/batteries/inspections', requireAuth, async (req, res) => {
    const result = await batteryService.getBatteryInspectionLogs(req.user.role);
    res.json(result);
  });

  router.post('/batteries/:id/inspection', requireAuth, async (req, res) => {
    const result = await batteryService.completeBatteryInspection(
      req.operatorId,
      req.user.role,
      req.params.id,
      req.body,
    );
    res.status(result.ok ? 200 : 400).json(result);
  });

  // Drones
  router.get('/drones', requireAuth, async (req, res) => {
    res.json(await droneService.getDrones(req.user.role));
  });

  router.post('/drones', requireAuth, async (req, res) => {
    const result = await droneService.addDrone(req.operatorId, req.user.role, req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.put('/drones/:id', requireAuth, async (req, res) => {
    const result = await droneService.updateDrone(req.operatorId, req.user.role, req.params.id, req.body);
    res.json(result);
  });

  router.delete('/drones/:id', requireAuth, async (req, res) => {
    res.json(await droneService.deleteDrone(req.operatorId, req.user.role, req.params.id));
  });

  // Sectors & weather
  router.get('/sectors/risk', requireAuth, async (req, res) => {
    res.json(await sectorService.getSectorsRisk(req.user.role));
  });

  router.post('/sectors', requireAuth, async (req, res) => {
    const { sectorName, centerLat, centerLon, radiusKm, options } = req.body ?? {};
    const result = await sectorService.createSector(
      req.operatorId,
      req.user.role,
      sectorName,
      centerLat,
      centerLon,
      radiusKm,
      options,
    );
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.put('/sectors/:id/boundary', requireAuth, async (req, res) => {
    res.json(await sectorService.updateSectorBoundary(req.operatorId, req.user.role, req.params.id, req.body));
  });

  router.delete('/sectors/:id', requireAuth, async (req, res) => {
    res.json(await sectorService.deleteSector(req.operatorId, req.user.role, req.params.id));
  });

  router.post('/sectors/import-kml', requireAuth, async (req, res) => {
    const result = await sectorService.importSectorsFromKmlContent(
      req.body?.kml,
      req.operatorId,
      req.user.role,
    );
    res.json(result);
  });

  router.get('/sectors/export-kml', requireAuth, async (req, res) => {
    const sectorId = req.query.sectorId ? parseInt(req.query.sectorId, 10) : null;
    const result = await sectorService.exportSectorsKml(sectorId);
    if (!result.ok) return res.status(400).json(result);
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    return res.send(result.data);
  });

  router.get('/weather', requireAuth, async (req, res) => {
    res.json(await sectorService.getWeather(req.query.lat, req.query.lon));
  });

  router.post('/weather/sync/:sectorId', requireAuth, async (req, res) => {
    const { lat, lon } = req.body ?? {};
    res.json(await sectorService.syncWeatherAPI(req.operatorId, req.user.role, req.params.sectorId, lat, lon));
  });

  router.post('/weather/sync-all', requireAuth, async (req, res) => {
    res.json(await sectorService.syncAllSectorsWeather(req.operatorId, req.user.role));
  });

  router.post('/weather/manual', requireAuth, async (req, res) => {
    const { sectorId, windSpeed, temperature, precipitation } = req.body ?? {};
    res.json(
      await sectorService.insertManualWeather(
        req.operatorId,
        req.user.role,
        sectorId,
        windSpeed,
        temperature,
        precipitation,
      ),
    );
  });

  // Messages
  router.get('/messages/unread', requireAuth, async (req, res) => {
    res.json(await messageService.getUnreadMessages(req.operatorId, req.user.role));
  });

  router.get('/messages/dialog/:peerId', requireAuth, async (req, res) => {
    const peerId = parseInt(req.params.peerId, 10);
    res.json(await messageService.getDialogMessages(req.operatorId, req.user.role, req.operatorId, peerId));
  });

  router.post('/messages', requireAuth, async (req, res) => {
    const { receiverId, text } = req.body ?? {};
    const result = await messageService.sendMessage(
      req.operatorId,
      req.user.role,
      req.operatorId,
      receiverId,
      text,
    );
    if (result.ok && io) {
      io.to(`user:${receiverId}`).emit('chat:message', result.data);
      io.to(`user:${req.operatorId}`).emit('chat:message', result.data);
    }
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.post('/messages/read/:peerId', requireAuth, async (req, res) => {
    res.json(await messageService.markDialogAsRead(req.operatorId, req.user.role, parseInt(req.params.peerId, 10)));
  });

  router.get('/messages/users', requireAuth, async (req, res) => {
    res.json(await messageService.getUsersForChat(req.operatorId, req.user.role, req.query.q));
  });

  // Operators
  router.get('/operators', requireAuth, async (req, res) => {
    res.json(await operatorService.getAllOperators(req.user.role));
  });

  router.post('/operators', requireAuth, async (req, res) => {
    const result = await operatorService.createOperator(req.operatorId, req.user.role, req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.put('/operators/:id', requireAuth, async (req, res) => {
    res.json(await operatorService.updateOperator(req.operatorId, req.user.role, parseInt(req.params.id, 10), req.body));
  });

  router.delete('/operators/:id', requireAuth, async (req, res) => {
    res.json(await operatorService.deleteOperator(req.operatorId, req.user.role, parseInt(req.params.id, 10)));
  });

  router.get('/operators/profile', requireAuth, async (req, res) => {
    res.json(await operatorService.getOperatorProfile(req.operatorId, req.operatorId));
  });

  router.get('/operators/profile/:id', requireAuth, async (req, res) => {
    res.json(await operatorService.getOperatorProfile(req.operatorId, parseInt(req.params.id, 10)));
  });

  router.get('/operators/kpis', requireAuth, async (req, res) => {
    res.json(await operatorService.getOperatorKPIs(req.operatorId));
  });

  router.get('/audit-logs', requireAuth, async (req, res) => {
    res.json(
      await operatorService.getAuditLogs(
        req.user.role,
        parseInt(req.query.limit || '50', 10),
        req.query.since,
      ),
    );
  });

  // Maintenance
  router.get('/maintenance', requireAuth, async (req, res) => {
    res.json(await maintenanceService.getMaintenanceLogs(req.user.role));
  });

  router.post('/maintenance', requireAuth, async (req, res) => {
    const result = await maintenanceService.addMaintenanceLog(req.operatorId, req.user.role, req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.post('/maintenance/complete/:droneId', requireAuth, async (req, res) => {
    res.json(await maintenanceService.completeMaintenance(req.operatorId, req.user.role, parseInt(req.params.droneId, 10)));
  });

  // Dashboard
  router.get('/dashboard/stats', requireAuth, async (req, res) => {
    res.json(await dashboardService.getDashboardStats(req.user.role));
  });

  router.get('/system/overview', requireAuth, async (req, res) => {
    res.json(await systemService.getSystemOverview(req.user.role));
  });

  router.get('/system/audit', requireAuth, async (req, res) => {
    res.json(
      await systemService.getAuditLogsPage(req.user.role, {
        limit: req.query.limit,
        offset: req.query.offset,
        since: req.query.since,
        until: req.query.until,
        operatorId: req.query.operatorId,
        search: req.query.search,
      }),
    );
  });

  router.get('/system/integrity', requireAuth, async (req, res) => {
    res.json(await systemService.getIntegrityReport(req.user.role));
  });

  router.get('/system/errors', requireAuth, async (req, res) => {
    res.json(
      await systemService.getSystemErrorLogs(req.user.role, {
        days: parseInt(req.query.days, 10) || undefined,
        limit: parseInt(req.query.limit, 10) || undefined,
        severity: req.query.severity,
        subsystem: req.query.subsystem,
        location: req.query.location,
        date: req.query.date,
        sinceHours: parseInt(req.query.sinceHours, 10) || undefined,
      }),
    );
  });

  router.get('/system/errors/stats', requireAuth, async (req, res) => {
    res.json(
      await systemService.getSystemErrorStats(req.user.role, {
        days: parseInt(req.query.days, 10) || undefined,
      }),
    );
  });

  router.post('/system/errors/report', requireAuth, async (req, res) => {
    res.json(
      await systemService.reportRendererError(req.user.role, req.operatorId, req.body),
    );
  });

  router.get('/health', async (_req, res) => {
    const health = await systemService.getHealth();
    res.status(health.ok ? 200 : 503).json(health);
  });

  return router;
}

module.exports = { createApiRouter };
