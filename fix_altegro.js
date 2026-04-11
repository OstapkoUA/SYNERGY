const fs = require('fs');
let c = fs.readFileSync('E:/synergy-bot/bot.js', 'utf8');

const oldFunc = `async function createAltegioBooking(name, phone, serviceIds, staffId, datetime) {
    if (!ALTEGIO_API_KEY) return { success: false, error: 'No API key' };
    try {
        const response = await axios.post(
            \`https://n816358.alteg.io/api/v2/records/\${ALTEGIO_LOCATION_ID}\`,
            {
                client: { name, phone },
                staff_id: staffId,
                services: Array.isArray(serviceIds) ? serviceIds.map(id => ({ id })) : [{ id: serviceIds }],
                datetime: datetime,
                save_if_busy: true
            },
            {
                headers: { Authorization: \`Bearer \${ALTEGIO_API_KEY}\`, 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}`;

const newFunc = `async function createAltegioBooking(name, phone, serviceIds, staffId, datetime) {
    if (!ALTEGIO_API_KEY) return { success: false, error: 'No API key' };
    try {
        let dateStr = datetime;
        const match = datetime.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})\\s*[оo]?\\s*(\\d{1,2}):(\\d{2})/);
        if (match) {
            dateStr = \`\${match[3]}-\${match[2].padStart(2, '0')}-\${match[1].padStart(2, '0')} \${match[4].padStart(2, '0')}:\${match[5]}:00\`;
        }
        
        const serviceId = Array.isArray(serviceIds) ? serviceIds[0] : serviceIds;
        
        const response = await axios.post(
            \`https://n816358.alteg.io/api/v2/companies/\${ALTEGIO_LOCATION_ID}/activities\`,
            {
                staff_id: staffId,
                service_id: serviceId,
                resource_instance_ids: [],
                label_ids: [],
                date: dateStr,
                length: 3600,
                capacity: 1,
                comment: name + ' | ' + phone
            },
            {
                headers: { 
                    Authorization: \`Bearer \${ALTEGIO_API_KEY}\`, 
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.alteg.v2+json'
                },
                timeout: 15000
            }
        );
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.response?.data?.meta?.message || e.message };
    }
}`;

if (c.includes(oldFunc)) {
    c = c.replace(oldFunc, newFunc);
    fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
    console.log('Fixed Altegro booking!');
} else {
    console.log('Old function not found, trying line-by-line...');
    const lines = c.split('\n');
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('async function createAltegioBooking')) startIdx = i;
        if (startIdx !== -1 && endIdx === -1 && lines[i].trim() === '}' && i > startIdx + 5) {
            endIdx = i;
            break;
        }
    }
    if (startIdx !== -1 && endIdx !== -1) {
        lines.splice(startIdx, endIdx - startIdx + 1, ...newFunc.split('\n'));
        c = lines.join('\n');
        fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
        console.log('Fixed Altegro booking (line-by-line)!');
    } else {
        console.log('Could not find function');
    }
}
