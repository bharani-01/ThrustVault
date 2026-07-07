'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

// ── Data Definitions ──────────────────────────────────────────────────────────
const BRANDS = {
  'T-Motor':      { esc: ['T-Motor FLAME 60A', 'T-Motor ALPHA 80A', 'T-Motor FLAME 40A'],         prop: ['T-Motor Carbon Fiber', 'T-Motor MF Series'] },
  'Hobbywing':    { esc: ['Hobbywing XRotor 40A', 'Hobbywing XRotor 60A', 'Hobbywing Platinum 80A'], prop: ['Hobbywing Prop', 'APC Prop'] },
  'KDE Direct':   { esc: ['KDE-UAS55i', 'KDE-UAS75i', 'KDE-UAS125i'],                              prop: ['KDE CF Prop', 'KDE Direct Prop'] },
  'Sunnysky':     { esc: ['Hobbywing XRotor 40A', 'Sunnysky ESC 60A'],                             prop: ['Sunnysky Prop', 'APC Prop'] },
  'Emax':         { esc: ['Emax BLHeli32 35A', 'Emax Formula 45A'],                                prop: ['Emax Avan 5', 'HQProp 5x4.3'] },
  'MAD Motor':    { esc: ['MAD AMPX 40A', 'MAD AMPX 80A', 'MAD AMPX 120A'],                       prop: ['MAD CF Prop', 'T-Motor Carbon Fiber'] },
  'Iflight':      { esc: ['Iflight BLHeli32 45A', 'Iflight Blitz 55A'],                            prop: ['HQProp 5x4.3', 'Gemfan 5inch'] },
  'Brotherhobby': { esc: ['BH BLHeli32 45A', 'Hobbywing XRotor 60A'],                             prop: ['HQProp 5x4.3', 'Gemfan 6inch'] },
  'Lumenier':     { esc: ['Lumenier BLHeli32 45A', 'Hobbywing Platinum 60A'],                      prop: ['Lumenier Butter Cutter 5', 'HQProp 5x4.3'] },
  'DJI':          { esc: ['DJI ESC 40A', 'DJI FOC ESC 60A'],                                      prop: ['DJI CF Folding Prop', 'DJI Carbon Prop'] },
  'Cobra':        { esc: ['Cobra ESC 40A', 'Hobbywing XRotor 60A'],                                prop: ['Cobra CF Prop', 'APC Prop'] },
  'Turnigy':      { esc: ['Turnigy Multistar 45A', 'Hobbywing XRotor 60A'],                        prop: ['Turnigy Prop', 'APC Prop'] },
};
const BRAND_NAMES = Object.keys(BRANDS);

const PREFIXES = {
  'T-Motor': ['U', 'MN', 'AT', 'P', 'F', 'V'], 'Hobbywing': ['XRotor', 'Platinum', 'FPV'],
  'KDE Direct': ['KDE', 'KDEXF', 'KDEUF'],      'Sunnysky': ['X', 'V', 'R', 'XS', 'XH'],
  'Emax': ['RS', 'MT', 'ECO', 'RSII', 'LS'],    'MAD Motor': ['M', 'MAD', 'MF', 'MP'],
  'Iflight': ['XING', 'XING-E', 'Bee'],         'Brotherhobby': ['Tornado', 'Avenger', 'Returner'],
  'Lumenier': ['RX', 'MX', 'Aero'],             'DJI': ['E', 'R', 'FOC'],
  'Cobra': ['CM', 'CP', 'CX'],                  'Turnigy': ['Multistar', 'Aerodrive', 'SK'],
};

const SUFFIXES = ['', ' Pro', ' V2', ' V3', ' Plus', ' HD', ' X', ' SE', ' II', ' III', ' Lite', ' Max'];
const TESTERS  = ['Bharani R.', 'Alex Chen', 'Marco Rossi', 'Sarah Kim', 'David Müller', 'Priya Nair', 'James O\'Brien', 'Yuki Tanaka'];
const ESC_PROTOCOLS = ['PWM', 'Oneshot125', 'Multishot', 'DSHOT150', 'DSHOT300', 'DSHOT600', 'DSHOT1200'];
const ESC_FIRMWARE = ['BLHeli_32', 'BLHeli_S', 'AM32', 'VESC', 'Proprietary'];
const ESC_CONNECTORS = ['3.5mm Bullet', '4mm Bullet', '5mm Bullet', 'XT30', 'XT60', 'Bare Wire'];

const CATS = [
  { name:'1kg Class',   desc:'Lightweight motors up to 1kg thrust. Ideal for 3-5" freestyle/racing FPV drones and micro UAVs.',                                          tMin:0.6,  tMax:1.0,  kvMin:2300,kvMax:3600, volts:['3S','4S'],          escs:['20A','30A','35A'],    props:['3"','4"','5"'],          odMin:22, odMax:28, shafts:[3,3.17],   mounts:['9x9','12x12','16x16'],   screws:['M2','M2.5'], swMin:22,swMax:28,shMin:6, shMax:10,wMin:20, wMax:60   },
  { name:'2kg Class',   desc:'Mid-range motors 1–2kg thrust. Suited for 5-7" long-range FPV builds and light payload drones.',                                            tMin:1.2,  tMax:2.0,  kvMin:1700,kvMax:2700, volts:['4S','5S','6S'],     escs:['35A','45A','50A'],    props:['5"','6"','7"'],          odMin:28, odMax:36, shafts:[3.17,4,5], mounts:['16x16','19x19','25x25'], screws:['M2.5','M3'],swMin:28,swMax:36,shMin:9, shMax:14,wMin:55, wMax:120  },
  { name:'5kg Class',   desc:'Heavy-lift motors 3–5kg thrust. For professional aerial photography, survey drones, and light commercial UAV platforms.',                    tMin:3.0,  tMax:5.0,  kvMin:300, kvMax:900,  volts:['6S','8S','10S','12S'],escs:['60A','80A','100A'],  props:['12"','14"','15"','16"'], odMin:40, odMax:60, shafts:[5,6,8],    mounts:['25x25','30x30','40x40'], screws:['M3','M4'],  swMin:40,swMax:55,shMin:14,shMax:22,wMin:150,wMax:320  },
  { name:'10kg Class',  desc:'Industrial motors 6–10kg thrust. Used in heavy-lift hexacopters, octocopters, and professional cargo UAV systems.',                          tMin:6.0,  tMax:10.0, kvMin:100, kvMax:400,  volts:['12S','14S','16S'],  escs:['100A','120A','160A'], props:['18"','20"','22"','24"'], odMin:60, odMax:80, shafts:[8,10,12],  mounts:['40x40','50x50','60x60'], screws:['M4','M5'],  swMin:55,swMax:70,shMin:20,shMax:28,wMin:300,wMax:550  },
  { name:'15kg Class',  desc:'Ultra heavy-lift motors 10–15kg thrust. For agricultural spraying drones, heavy cargo delivery, and industrial inspection UAVs.',            tMin:10.0, tMax:15.0, kvMin:80,  kvMax:200,  volts:['16S','22S'],        escs:['160A','200A','240A'], props:['26"','28"','30"','32"'], odMin:80, odMax:100,shafts:[10,12,15], mounts:['60x60','80x80'],         screws:['M5','M6'],  swMin:70,swMax:90,shMin:25,shMax:35,wMin:500,wMax:900  },
  { name:'20kg+ Class', desc:'Maximum thrust motors exceeding 15kg. For the largest commercial UAV platforms, heavy industrial drones, and next-generation aerial systems.',tMin:15.0, tMax:25.0, kvMin:40,  kvMax:120,  volts:['22S','24S'],        escs:['240A','300A','400A'], props:['32"','36"','40"'],       odMin:100,odMax:130,shafts:[12,15,20], mounts:['80x80','100x100'],       screws:['M6','M8'],  swMin:90,swMax:120,shMin:30,shMax:45,wMin:850,wMax:1800},
];

// Helper Functions
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randDec = (min, max, dec = 1) => parseFloat((Math.random() * (max - min) + min).toFixed(dec));

async function main() {
  console.log('🔌 Connecting to PostgreSQL database to seed catalog data...');
  const client = await pool.connect();
  try {
    // ── 1. Clear Old Data ──────────────────────────────────────────────────────
    console.log('🧹 Clearing existing motor test runs, motors, and categories...');
    await client.query('BEGIN');
    await client.query('DELETE FROM public.motor_test_data_points');
    await client.query('DELETE FROM public.motor_test_runs');
    await client.query('DELETE FROM public.motors');
    await client.query('DELETE FROM public.categories');
    await client.query('DELETE FROM public.escs');
    await client.query('DELETE FROM public.propellers');
    console.log('✅ Catalog tables cleared successfully.');

    // ── 2. Categories ─────────────────────────────────────────────────────────
    console.log('📂 Seeding categories...');
    const catMap = {};
    for (const c of CATS) {
      const res = await client.query(
        'INSERT INTO public.categories (name, description) VALUES ($1, $2) RETURNING id',
        [c.name, c.desc]
      );
      catMap[c.name] = res.rows[0].id;
    }
    console.log(`✅ ${CATS.length} categories seeded successfully.`);

    // ── 3. Motors ─────────────────────────────────────────────────────────────
    console.log('⚙️ Seeding motors payload...');
    const motorIds = [];
    const motorsList = [];

    for (const cat of CATS) {
      const used = new Set();
      const count = randInt(15, 25); // Create 15-25 motors per category
      for (let i = 0; i < count; i++) {
        const brand    = pick(BRAND_NAMES);
        const prefix   = pick(PREFIXES[brand]);
        const suffix   = pick(SUFFIXES);
        
        let statKv = 0;
        let sizeCode = '';
        if (cat.name === '1kg Class')   { statKv = randInt(2400, 3400); sizeCode = `${randInt(22, 23)}0${randInt(4, 7)}`; }
        if (cat.name === '2kg Class')   { statKv = randInt(1600, 2500); sizeCode = `${randInt(28, 30)}0${randInt(6, 9)}`; }
        if (cat.name === '5kg Class')   { statKv = randInt(350, 800);   sizeCode = `${randInt(40, 50)}${randInt(10, 15)}`; }
        if (cat.name === '10kg Class')  { statKv = randInt(120, 320);   sizeCode = `${randInt(60, 80)}${randInt(12, 20)}`; }
        if (cat.name === '15kg Class')  { statKv = randInt(90, 180);    sizeCode = `${randInt(80, 100)}${randInt(18, 30)}`; }
        if (cat.name === '20kg+ Class') { statKv = randInt(45, 95);     sizeCode = `1${randInt(0, 2)}0${randInt(25, 45)}`; }

        const motorName = `${prefix}${sizeCode} KV${statKv}${suffix}`;
        if (used.has(motorName)) continue;
        used.add(motorName);

        const customParams = {
          motor_diameter_od:           randInt(cat.odMin, cat.odMax),
          motor_holes_mount_diameter:  pick(cat.mounts),
          screw_type:                  pick(cat.screws),
          shaft_diameter:              pick(cat.shafts),
        };

        const recEsc  = pick(BRANDS[brand].esc);
        const recProp = pick(BRANDS[brand].prop) + ' ' + pick(cat.props);
        const maxThrustStr = `${cat.tMax.toFixed(1)} kg`;

        motorsList.push({
          catId: catMap[cat.name],
          name: motorName,
          brand,
          maxThrustStr,
          recEsc,
          recProp,
          customParams
        });
      }
    }

    for (const m of motorsList) {
      const res = await client.query(`
        INSERT INTO public.motors (
          category_id, motor_name, company, max_thrust, 
          recommended_esc, recommended_propeller, 
          link_motor, link_esc, link_propeller, 
          custom_parameters
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, motor_name
      `, [
        m.catId, m.name, m.brand, m.maxThrustStr,
        m.recEsc, m.recProp,
        `https://store.tmotor.com/search.php?q=${encodeURIComponent(m.name)}`,
        null, null,
        JSON.stringify(m.customParams)
      ]);
      motorIds.push(res.rows[0]);
    }
    console.log(`✅ ${motorIds.length} motors seeded successfully.`);

    // ── 4. Seed ESCs & Propellers catalog tables ──────────────────────────────
    console.log('🔌 Seeding ESCs catalog...');
    const ESC_BRANDS = ['T-Motor', 'Hobbywing', 'KDE Direct', 'Holybro', 'APM', 'APD'];
    for (let i = 0; i < 30; i++) {
      const brand = pick(ESC_BRANDS);
      const name = `${brand} ${pick(['AIR', 'Alpha', 'Flame', 'XRotor', 'UAS'])} ${pick([20, 30, 40, 60, 80, 100, 120, 160])}A`;
      await client.query(`
        INSERT INTO public.escs (
          name, manufacturer, continuous_current, peak_current, 
          voltage_support, protocol, firmware, connector_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        name, brand, randInt(20, 160), randInt(30, 200),
        `${randInt(3, 6)}S LiPo`, pick(ESC_PROTOCOLS), pick(ESC_FIRMWARE), pick(ESC_CONNECTORS)
      ]);
    }

    console.log('📐 Seeding Propellers catalog...');
    const PROP_BRANDS = ['T-Motor', 'APC', 'Gemfan', 'HQProp', 'Master Airscrew'];
    for (let i = 0; i < 30; i++) {
      const brand = pick(PROP_BRANDS);
      const dia = randDec(5, 32, 1);
      const pitch = randDec(3, 12, 1);
      const name = `${brand} ${dia}x${pitch} Carbon Prop`;
      await client.query(`
        INSERT INTO public.propellers (
          name, manufacturer, diameter, pitch, material, folding
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        name, brand, dia, pitch, pick(['Carbon Fiber', 'Nylon', 'Glass Fiber', 'Wood']), Math.random() > 0.75
      ]);
    }
    console.log('✅ ESCs and Propellers seeded.');

    // ── 5. Seed Test Runs & Data Points ───────────────────────────────────────
    console.log('📊 Seeding test runs and telemetry data points...');
    let runsCount = 0;
    let pointsCount = 0;

    for (const m of motorIds) {
      // Create 2 test runs for each motor
      const runsToCreate = 2;
      for (let runIdx = 1; runIdx <= runsToCreate; runIdx++) {
        const tester = pick(TESTERS);
        const voltOptions = [11.1, 14.8, 22.2, 44.4];
        const voltage = pick(voltOptions);
        const propUsed = pick(['T-Motor 15x5 CF', 'APC 12x4.5', 'HQProp 5x4.3', 'Gemfan 10x4.5']);
        
        const runRes = await client.query(`
          INSERT INTO public.motor_test_runs (
            motor_id, tester_name, voltage, propeller, notes
          ) VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [
          m.id, tester, voltage, propUsed,
          `Seeded system telemetry benchmarking for ${m.motor_name} (Run #${runIdx}).`
        ]);

        const runId = runRes.rows[0].id;
        runsCount++;

        // Generate data points for throttle levels: 50%, 65%, 75%, 85%, 100%
        const throttleLevels = [50, 65, 75, 85, 100];
        for (const throttle of throttleLevels) {
          const current   = randDec(1.5, 45.0, 2);
          const powerW    = parseFloat((current * voltage).toFixed(2));
          const thrustG   = randInt(250, 3200);
          const rpm       = randInt(2000, 8500);
          const temp      = randDec(25.0, 65.0, 1);
          const efficiency = parseFloat((thrustG / powerW).toFixed(2));

          await client.query(`
            INSERT INTO public.motor_test_data_points (
              run_id, throttle_pct, current_a, voltage_v, power_w, 
              thrust_g, rpm, efficiency_g_w, temperature_c
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            runId, throttle, current, voltage, powerW,
            thrustG, rpm, efficiency, temp
          ]);
          pointsCount++;
        }
      }
    }
    
    await client.query('COMMIT');
    console.log(`\n🎉 SEED COMPLETE:`);
    console.log(`   - ${runsCount} test runs created.`);
    console.log(`   - ${pointsCount} telemetry data points populated.`);
    console.log('🎉 Catalog database seeded successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding Failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
