import { useAppData } from '../../context/AppDataContext';

import { useAuth } from '../../context/AuthContext';

import { canForceWeatherSync } from '../../utils/permissions';

import {

  getManagerDashboardKpiGroups,

  getOperatorFleetKpiCards,

  isManagerLikeRole,

} from '../../utils/operationalKpis';

import { KpiCard } from '../ui/KpiCard';

import { SectorMap } from '../map/SectorMap';

import { UpcomingMissions } from './UpcomingMissions';

import { WeatherRiskChart } from './WeatherRiskChart';

import { DashboardWeatherControls } from './DashboardWeatherControls';
import { PendingApprovals } from './PendingApprovals';

import './Dashboard.css';



export function Dashboard() {

  const {

    dronesReadyCount,

    dronesInAirCount,

    dronesPlannedCount,

    dronesOnMaintenanceCount,

    dronesInRepairCount,

    operationalOverview,

  } = useAppData();

  const { user } = useAuth();

  const showWeatherControls = user && canForceWeatherSync(user.role);

  const showManagerOverview = isManagerLikeRole(user?.role);



  const operatorFleetCards = getOperatorFleetKpiCards({

    dronesReadyCount,

    dronesPlannedCount,

    dronesInAirCount,

    dronesOnMaintenanceCount,

    dronesInRepairCount,

  });



  const managerKpiGroups = getManagerDashboardKpiGroups(operationalOverview);



  return (

    <div className="dashboard">

      {showManagerOverview ? (

        <div className="dashboard__kpi-groups">

          {managerKpiGroups.map((group) => (

            <section key={group.title} className="dashboard__kpi-group">

              <h2 className="dashboard__kpi-group-title">{group.title}</h2>

              <div className="dashboard__kpi">

                {group.cards.map((card) => (

                  <KpiCard

                    key={card.key}

                    label={card.label}

                    value={card.value}

                    variant={card.variant}

                    icon={<span>{card.icon}</span>}

                  />

                ))}

              </div>

            </section>

          ))}

        </div>

      ) : (

        <section className="dashboard__kpi">

          {operatorFleetCards.map((card) => (

            <KpiCard

              key={card.key}

              label={card.label}

              value={card.value}

              variant={card.variant}

              icon={<span>{card.icon}</span>}

            />

          ))}

        </section>

      )}



      {showWeatherControls && <DashboardWeatherControls />}

      {showManagerOverview && <PendingApprovals />}

      <section className="dashboard__grid">
        <WeatherRiskChart />
        <UpcomingMissions />
      </section>

      <SectorMap />

    </div>

  );

}

