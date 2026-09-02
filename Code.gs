/**
 * IP2Location.io for Google Sheets
 *
 * Workflow:
 * 1. Put IP2Location.io field names in row 1 (for example: country_name,
 *    city_name, isp, proxy.is_vpn).
 * 2. Highlight the IP addresses to process in a single column.
 * 3. Run IP2Location > Lookup Selected IPs.
 * 4. Results are written as static values into matching header columns.
 *
 * API behavior:
 * - No API key: Normal API in keyless mode.
 * - API key + one IP: Normal API.
 * - API key + multiple IPs: Bulk API is tried when capability is unknown.
 * - If Bulk is unavailable but Normal works, that capability is cached per user.
 * - Paid Bulk-capable keys use the Bulk API (up to 1,000 IPs per request).
 *
 * API keys and Bulk capability are stored in UserProperties, so each user of
 * the spreadsheet can configure their own key without placing it in a cell.
 */

const IP2LOCATION_IO_CONFIG = Object.freeze({
  MENU_NAME: 'IP2Location.io',
  HEADER_ROW: 1,
  NORMAL_API_URL: 'https://api.ip2location.io/',
  BULK_API_URL: 'https://bulk.ip2location.io/',
  BULK_MAX_IPS: 1000,
  NORMAL_FETCHALL_BATCH_SIZE: 100,
  MAX_SELECTED_ROWS: 10000,
  BULK_CAPABILITY_PROBE_IP: '8.8.8.8',
  PROP_API_KEY: 'IP2LOCATION_IO_API_KEY',
  PROP_BULK_CAPABILITY: 'IP2LOCATION_IO_BULK_SUPPORTED'
});

/**
 * Known API fields that may be used as sheet headers.
 *
 * This list is plan-agnostic. A field can be recognized by the script even if
 * the user's current API access does not return it. In that case the output
 * cell is left blank for successful lookups.
 */
const IP2LOCATION_IO_KNOWN_FIELDS = Object.freeze([
  'ip',
  'country_code',
  'country_name',
  'region_name',
  'city_name',
  'latitude',
  'longitude',
  'zip_code',
  'time_zone',
  'asn',
  'as',
  'isp',
  'domain',
  'net_speed',
  'idd_code',
  'area_code',
  'weather_station_code',
  'weather_station_name',
  'mcc',
  'mnc',
  'mobile_brand',
  'elevation',
  'usage_type',
  'address_type',
  'ads_category',
  'ads_category_name',
  'district',
  'is_proxy',
  'fraud_score',

  // Whole objects
  'as_info',
  'continent',
  'country',
  'region',
  'city',
  'time_zone_info',
  'geotargeting',
  'proxy',

  // Nested fields
  'as_info.as_name',
  'as_info.as_number',
  'as_info.as_domain',
  'as_info.as_cidr',
  'as_info.as_usage_type',

  'continent.name',
  'continent.code',
  'continent.hemisphere',
  'continent.translation',

  'country.name',
  'country.alpha3_code',
  'country.numeric_code',
  'country.demonym',
  'country.flag',
  'country.capital',
  'country.total_area',
  'country.population',
  'country.currency',
  'country.language',
  'country.tld',
  'country.translation',

  'region.name',
  'region.code',
  'region.translation',

  'city.name',
  'city.translation',

  'time_zone_info.olson',
  'time_zone_info.current_time',
  'time_zone_info.gmt_offset',
  'time_zone_info.is_dst',
  'time_zone_info.abbreviation',
  'time_zone_info.dst_start_date',
  'time_zone_info.dst_end_date',
  'time_zone_info.sunrise',
  'time_zone_info.sunset',

  'geotargeting.metro',

  'proxy.last_seen',
  'proxy.proxy_type',
  'proxy.threat',
  'proxy.provider',
  'proxy.is_vpn',
  'proxy.is_tor',
  'proxy.is_data_center',
  'proxy.is_public_proxy',
  'proxy.is_web_proxy',
  'proxy.is_web_crawler',
  'proxy.is_ai_crawler',
  'proxy.is_residential_proxy',
  'proxy.is_spammer',
  'proxy.is_scanner',
  'proxy.is_botnet',
  'proxy.is_bogon',
  'proxy.is_consumer_privacy_network',
  'proxy.is_enterprise_private_network'
]);

/**
 * Fields currently documented as accepted by the Bulk API's `fields`
 * parameter. If every requested output field is in this list, the script asks
 * Bulk for only those fields. Otherwise it omits `fields` and lets the API
 * return everything available, which is safer for forward compatibility.
 */
const IP2LOCATION_IO_BULK_FILTER_FIELDS = Object.freeze([
  'country_code',
  'country_name',
  'region_name',
  'city_name',
  'latitude',
  'longitude',
  'zip_code',
  'time_zone',
  'asn',
  'as',
  'as_info.as_name',
  'as_info.as_number',
  'as_info.as_domain',
  'as_info.as_cidr',
  'as_info.as_usage_type',
  'isp',
  'domain',
  'net_speed',
  'idd_code',
  'area_code',
  'weather_station_code',
  'weather_station_name',
  'mcc',
  'mnc',
  'mobile_brand',
  'elevation',
  'usage_type',
  'ads_category',
  'ads_category_name',
  'district',
  'continent.name',
  'continent.code',
  'continent.hemisphere',
  'continent.translation',
  'country.name',
  'country.alpha3_code',
  'country.numeric_code',
  'country.demonym',
  'country.flag',
  'country.capital',
  'country.total_area',
  'country.population',
  'country.currency',
  'country.language',
  'country.tld',
  'country.translation',
  'region.name',
  'region.code',
  'region.translation',
  'city.name',
  'city.translation',
  'time_zone_info.olson',
  'time_zone_info.current_time',
  'time_zone_info.gmt_offset',
  'time_zone_info.is_dst',
  'time_zone_info.abbreviation',
  'time_zone_info.dst_start_date',
  'time_zone_info.dst_end_date',
  'time_zone_info.sunrise',
  'time_zone_info.sunset',
  'geotargeting.metro',
  'is_proxy',
  'fraud_score',
  'proxy.last_seen',
  'proxy.proxy_type',
  'proxy.threat',
  'proxy.provider',
  'proxy.is_vpn',
  'proxy.is_tor',
  'proxy.is_data_center',
  'proxy.is_public_proxy',
  'proxy.is_web_proxy',
  'proxy.is_web_crawler',
  'proxy.is_ai_crawler',
  'proxy.is_residential_proxy',
  'proxy.is_spammer',
  'proxy.is_scanner',
  'proxy.is_botnet',
  'proxy.is_bogon',
  'proxy.is_consumer_privacy_network',
  'proxy.is_enterprise_private_network'
]);

const IP2LOCATION_IO_KNOWN_FIELD_SET = new Set(IP2LOCATION_IO_KNOWN_FIELDS);
const IP2LOCATION_IO_BULK_FILTER_FIELD_SET = new Set(IP2LOCATION_IO_BULK_FILTER_FIELDS);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(IP2LOCATION_IO_CONFIG.MENU_NAME)
    .addItem('Lookup Selected IPs', 'lookupSelectedIPs')
    .addSeparator()
    .addItem('Set / Update API Key', 'setApiKey')
    .addItem('Remove API Key', 'removeApiKey')
    .addItem('Recheck Bulk API Access', 'recheckBulkApiAccess')
    .addItem('API Status', 'showApiStatus')
    .addToUi();
}

function onInstall() {
  onOpen();
}

/**
 * Main entry point used by the menu.
 */
function lookupSelectedIPs() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const selection = sheet.getActiveRange();

  if (!selection) {
    ui.alert('IP2Location.io', 'Please highlight one or more IP addresses first.', ui.ButtonSet.OK);
    return;
  }

  if (selection.getNumColumns() !== 1) {
    ui.alert(
      'IP2Location.io',
      'Please highlight IP addresses in one column only. The selected column is treated as the input IP column.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Prevent accidental whole-column selections (for example A:A) from
  // reading/writing hundreds of thousands of cells.
  if (selection.getNumRows() > IP2LOCATION_IO_CONFIG.MAX_SELECTED_ROWS) {
    ui.alert(
      'IP2Location.io',
      'The selection contains ' + selection.getNumRows().toLocaleString() +
        ' rows. Please select at most ' +
        IP2LOCATION_IO_CONFIG.MAX_SELECTED_ROWS.toLocaleString() +
        ' rows at a time.',
      ui.ButtonSet.OK
    );
    return;
  }

  const selectedRows = getSelectedIpRows_(selection);

  if (selectedRows.length === 0) {
    ui.alert(
      'IP2Location.io',
      'No IP addresses were found below the header row in the selected cells.',
      ui.ButtonSet.OK
    );
    return;
  }

  const inputColumn = selection.getColumn();
  const mappings = getOutputMappings_(sheet, inputColumn);

  if (mappings.length === 0) {
    ui.alert(
      'IP2Location.io',
      'No recognized IP2Location.io field headers were found in row ' + IP2LOCATION_IO_CONFIG.HEADER_ROW + '.\n\n' +
        'Examples: country_code, country_name, city_name, isp, as_info.as_name, proxy.is_vpn',
      ui.ButtonSet.OK
    );
    return;
  }

  const uniqueIps = [...new Set(selectedRows.map(function (item) { return item.ip; }))];
  const requestedFields = [...new Set(mappings.map(function (item) { return item.field; }))];
  const apiKey = getApiKey_();

  SpreadsheetApp.getActive().toast(
    'Looking up ' + uniqueIps.length + ' unique IP' + (uniqueIps.length === 1 ? '' : 's') + '...',
    'IP2Location.io',
    5
  );

  let lookup;

  try {
    lookup = lookupWithBestApi_(uniqueIps, apiKey, requestedFields);
  } catch (error) {
    ui.alert(
      'IP2Location.io lookup failed',
      getErrorMessage_(error),
      ui.ButtonSet.OK
    );
    return;
  }

  const writeSummary = writeResults_(
    sheet,
    selection,
    selectedRows,
    mappings,
    lookup.results,
    lookup.errors
  );

  showLookupSummary_(lookup, selectedRows, writeSummary);
}

/**
 * Saves an API key for the current user. The key is not stored in the sheet.
 */
function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'IP2Location.io API Key',
    'Enter your IP2Location.io API key. Leave your sheet cells free of credentials.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const apiKey = response.getResponseText().trim();

  if (!apiKey) {
    ui.alert('IP2Location.io', 'API key cannot be empty.', ui.ButtonSet.OK);
    return;
  }

  const props = PropertiesService.getUserProperties();
  props.setProperty(IP2LOCATION_IO_CONFIG.PROP_API_KEY, apiKey);

  // A different/new key may have different Bulk capability.
  props.deleteProperty(IP2LOCATION_IO_CONFIG.PROP_BULK_CAPABILITY);

  ui.alert(
    'IP2Location.io',
    'API key saved for your user account. Bulk API capability will be detected when you process multiple IPs.',
    ui.ButtonSet.OK
  );
}

/**
 * Removes the current user's stored API key and Bulk capability cache.
 */
function removeApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Remove API Key',
    'Remove your saved IP2Location.io API key? Future lookups will use the keyless API until another key is configured.',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const props = PropertiesService.getUserProperties();
  props.deleteProperty(IP2LOCATION_IO_CONFIG.PROP_API_KEY);
  props.deleteProperty(IP2LOCATION_IO_CONFIG.PROP_BULK_CAPABILITY);

  ui.alert('IP2Location.io', 'API key removed. Keyless mode is now active.', ui.ButtonSet.OK);
}

/**
 * Clears the cached Bulk capability. Useful after upgrading/downgrading an
 * account while keeping the same API key.
 */
function recheckBulkApiAccess() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();

  if (!getApiKey_()) {
    ui.alert(
      'IP2Location',
      'No API key is configured. The Bulk API requires an API key with Bulk access.',
      ui.ButtonSet.OK
    );
    return;
  }

  props.deleteProperty(IP2LOCATION_IO_CONFIG.PROP_BULK_CAPABILITY);
  ui.alert(
    'IP2Location.io',
    'Bulk capability cache cleared. The next lookup of multiple IPs will check Bulk access again.',
    ui.ButtonSet.OK
  );
}

/**
 * Displays configuration status without exposing the API key.
 */
function showApiStatus() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = getApiKey_();
  const capability = getBulkCapability_();

  let bulkText = 'Unknown (not checked yet)';
  if (capability === 'true') {
    bulkText = 'Available (cached)';
  } else if (capability === 'false') {
    bulkText = 'Unavailable (cached)';
  }

  ui.alert(
    'IP2Location.io API Status',
    'API key: ' + (apiKey ? 'Configured' : 'Not configured - keyless API will be used') + '\n' +
      'Bulk API: ' + bulkText,
    ui.ButtonSet.OK
  );
}

function getApiKey_() {
  return PropertiesService
    .getUserProperties()
    .getProperty(IP2LOCATION_IO_CONFIG.PROP_API_KEY);
}

function getBulkCapability_() {
  return PropertiesService
    .getUserProperties()
    .getProperty(IP2LOCATION_IO_CONFIG.PROP_BULK_CAPABILITY) || 'unknown';
}

function setBulkCapability_(value) {
  PropertiesService
    .getUserProperties()
    .setProperty(IP2LOCATION_IO_CONFIG.PROP_BULK_CAPABILITY, value ? 'true' : 'false');
}

/**
 * Converts the highlighted single-column range into row/IP pairs.
 * Blank cells and the configured header row are ignored.
 */
function getSelectedIpRows_(selection) {
  const startRow = selection.getRow();
  const values = selection.getDisplayValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    const sheetRow = startRow + i;

    if (sheetRow <= IP2LOCATION_IO_CONFIG.HEADER_ROW) {
      continue;
    }

    const ip = String(values[i][0] || '').trim();
    if (!ip) {
      continue;
    }

    rows.push({
      row: sheetRow,
      offset: i,
      ip: ip
    });
  }

  return rows;
}

/**
 * Finds recognized API field headers in the configured header row.
 * Unrecognized headers are intentionally ignored so unrelated columns such as
 * "Notes" or "Customer ID" are never modified.
 */
function getOutputMappings_(sheet, inputColumn) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    return [];
  }

  const headers = sheet
    .getRange(IP2LOCATION_IO_CONFIG.HEADER_ROW, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const mappings = [];

  for (let col = 1; col <= lastColumn; col++) {
    if (col === inputColumn) {
      continue;
    }

    const field = normalizeHeader_(headers[col - 1]);

    if (field && IP2LOCATION_IO_KNOWN_FIELD_SET.has(field)) {
      mappings.push({
        column: col,
        field: field
      });
    }
  }

  return mappings;
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Selects Normal or Bulk API without needing to know the user's named plan.
 */
function lookupWithBestApi_(ips, apiKey, requestedFields) {
  if (!apiKey) {
    const keylessResult = lookupNormal_(ips, null);
    keylessResult.mode = 'Normal API (keyless)';
    keylessResult.notice = '';
    return keylessResult;
  }

  // Bulk offers no practical benefit for a single IP.
  if (ips.length === 1) {
    const singleResult = lookupNormal_(ips, apiKey);
    singleResult.mode = 'Normal API';
    singleResult.notice = '';
    return singleResult;
  }

  const capability = getBulkCapability_();

  if (capability === 'false') {
    const normalResult = lookupNormal_(ips, apiKey);
    normalResult.mode = 'Normal API';
    normalResult.notice = '';
    return normalResult;
  }

  try {
    const bulkResult = lookupBulk_(ips, apiKey, requestedFields);
    setBulkCapability_(true);
    bulkResult.mode = 'Bulk API';
    bulkResult.notice = '';
    return bulkResult;
  } catch (bulkError) {
    if (isBulkCapabilityError_(bulkError)) {
      // A Bulk 401 is ambiguous. Check whether the same key still works on the
      // Normal API before classifying Bulk as unavailable.
      const probeIp = IP2LOCATION_IO_CONFIG.BULK_CAPABILITY_PROBE_IP;
      const probe = lookupNormal_([probeIp], apiKey);

      if (probe.results[probeIp]) {
        setBulkCapability_(false);

        const fallback = lookupNormal_(ips, apiKey);
        fallback.mode = 'Normal API';
        fallback.notice = 'Bulk API was unavailable for this key, so the Normal API was used and that capability was cached.';
        return fallback;
      }

      const probeMessage = probe.errors[probeIp] || 'Normal API validation failed.';
      throw new Error(
        'Bulk API request failed, and the API key could not be validated with the Normal API. ' + probeMessage
      );
    }

    // Do not cache a capability result for transient/server/network failures.
    // Falling back keeps the lookup useful while allowing Bulk to be retried
    // on a future run.
    const transientFallback = lookupNormal_(ips, apiKey);
    transientFallback.mode = 'Normal API';
    transientFallback.notice = 'Bulk API could not be used for this lookup (' + getErrorMessage_(bulkError) + '). Normal API fallback was used.';
    return transientFallback;
  }
}

/**
 * Normal API lookup. Uses fetchAll in manageable chunks and deduplicated IPs.
 */
function lookupNormal_(ips, apiKey) {
  const results = {};
  const errors = {};

  for (let start = 0; start < ips.length; start += IP2LOCATION_IO_CONFIG.NORMAL_FETCHALL_BATCH_SIZE) {
    const batch = ips.slice(start, start + IP2LOCATION_IO_CONFIG.NORMAL_FETCHALL_BATCH_SIZE);
    const requests = batch.map(function (ip) {
      const request = {
        url: IP2LOCATION_IO_CONFIG.NORMAL_API_URL + '?ip=' + encodeURIComponent(ip) + '&format=json',
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          Accept: 'application/json'
        }
      };

      if (apiKey) {
        request.headers.Authorization = 'Bearer ' + apiKey;
      }

      return request;
    });

    let responses;

    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (error) {
      const message = 'Network/request error: ' + getErrorMessage_(error);
      batch.forEach(function (ip) {
        errors[ip] = message;
      });
      continue;
    }

    responses.forEach(function (response, index) {
      const ip = batch[index];
      const parsed = parseApiResponse_(response, 'Normal API lookup for ' + ip);

      if (parsed.ok) {
        const data = parsed.data;
        if (data && typeof data === 'object' && !Object.prototype.hasOwnProperty.call(data, 'ip')) {
          data.ip = ip;
        }
        results[ip] = data;
      } else {
        errors[ip] = parsed.message;
      }
    });
  }

  return {
    results: results,
    errors: errors
  };
}

/**
 * Bulk API lookup, automatically split into batches of at most 1,000 IPs.
 */
function lookupBulk_(ips, apiKey, requestedFields) {
  const results = {};
  const errors = {};

  for (let start = 0; start < ips.length; start += IP2LOCATION_IO_CONFIG.BULK_MAX_IPS) {
    const batch = ips.slice(start, start + IP2LOCATION_IO_CONFIG.BULK_MAX_IPS);
    const responseData = callBulkBatch_(batch, apiKey, requestedFields);

    // Build normalized lookup table because the Bulk API may expand IPv6.
    const normalizedResponse = {};

    Object.keys(responseData).forEach(function (responseIp) {
      normalizedResponse[normalizeIpAddress_(responseIp)] =
        responseData[responseIp];
    });

    batch.forEach(function (ip) {
      const normalizedIp = normalizeIpAddress_(ip);

      if (!Object.prototype.hasOwnProperty.call(
        normalizedResponse,
        normalizedIp
      )) {
        errors[ip] = 'Bulk API returned no result for this IP.';
        return;
      }

      const data = normalizedResponse[normalizedIp];

      if (data && typeof data === 'object' && data.error) {
        errors[ip] =
          getApiErrorFromObject_(data) ||
          'Bulk API returned an error for this IP.';
        return;
      }

      if (
        data &&
        typeof data === 'object' &&
        !Object.prototype.hasOwnProperty.call(data, 'ip')
      ) {
        // Keep the user's original representation.
        data.ip = ip;
      }

      results[ip] = data;
    });
  }

  return {
    results: results,
    errors: errors
  };
}

function normalizeIpAddress_(ip) {
  let address = String(ip).trim().toLowerCase();

  // IPv4 doesn't need IPv6 normalization.
  if (address.indexOf(':') === -1) {
    return address;
  }

  try {
    return expandIpv6_(address);
  } catch (e) {
    // If normalization fails, preserve the original value.
    return address;
  }
}

function expandIpv6_(address) {
  let ip = address.toLowerCase();

  // Handle IPv4 embedded in IPv6, e.g. ::ffff:192.0.2.1
  if (ip.indexOf('.') !== -1) {
    const lastColon = ip.lastIndexOf(':');
    const ipv4 = ip.substring(lastColon + 1).split('.');

    if (ipv4.length !== 4) {
      throw new Error('Invalid embedded IPv4 address');
    }

    const bytes = ipv4.map(function (part) {
      const value = Number(part);

      if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > 255
      ) {
        throw new Error('Invalid embedded IPv4 address');
      }

      return value;
    });

    const group1 =
      ((bytes[0] << 8) | bytes[1])
        .toString(16);

    const group2 =
      ((bytes[2] << 8) | bytes[3])
        .toString(16);

    ip =
      ip.substring(0, lastColon + 1) +
      group1 +
      ':' +
      group2;
  }

  const doubleColonParts = ip.split('::');

  if (doubleColonParts.length > 2) {
    throw new Error('Invalid IPv6 address');
  }

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(':')
    : [];

  const right =
    doubleColonParts.length === 2 && doubleColonParts[1]
      ? doubleColonParts[1].split(':')
      : [];

  let groups;

  if (doubleColonParts.length === 2) {
    const missing = 8 - left.length - right.length;

    if (missing < 1) {
      throw new Error('Invalid IPv6 address');
    }

    groups = left
      .concat(new Array(missing).fill('0'))
      .concat(right);

  } else {
    groups = left;

    if (groups.length !== 8) {
      throw new Error('Invalid IPv6 address');
    }
  }

  if (groups.length !== 8) {
    throw new Error('Invalid IPv6 address');
  }

  return groups.map(function (group) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      throw new Error('Invalid IPv6 group');
    }

    return parseInt(group, 16)
      .toString(16)
      .padStart(4, '0');
  }).join(':');
}

function callBulkBatch_(ips, apiKey, requestedFields) {
  let url = IP2LOCATION_IO_CONFIG.BULK_API_URL + '?format=json';
  const bulkFields = getSafeBulkFieldFilter_(requestedFields);

  if (bulkFields.length > 0) {
    url += '&fields=' + encodeURIComponent(bulkFields.join(','));
  }

  let response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(ips),
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiKey
      }
    });
  } catch (error) {
    throw new Error('Bulk API network/request error: ' + getErrorMessage_(error));
  }

  const parsed = parseApiResponse_(response, 'Bulk API lookup');

  if (!parsed.ok) {
    const error = new Error(parsed.message);
    error.httpStatus = parsed.httpStatus;
    error.apiErrorCode = parsed.apiErrorCode;
    throw error;
  }

  return parsed.data;
}

/**
 * Returns requested fields only when every field is currently documented as a
 * Bulk `fields` value. Otherwise returns [] so Bulk will return all fields
 * available to the account instead of rejecting a possibly new/unsupported
 * field name.
 */
function getSafeBulkFieldFilter_(requestedFields) {
  if (!requestedFields || requestedFields.length === 0) {
    return [];
  }

  const allSupported = requestedFields.every(function (field) {
    return IP2LOCATION_IO_BULK_FILTER_FIELD_SET.has(field);
  });

  return allSupported ? requestedFields : [];
}

/**
 * Parses HTTP/API errors without assuming that every API error uses a non-2xx
 * status code.
 */
function parseApiResponse_(response, context) {
  const httpStatus = response.getResponseCode();
  const text = response.getContentText();
  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      httpStatus: httpStatus,
      apiErrorCode: null,
      message: context + ' returned invalid JSON (HTTP ' + httpStatus + ').'
    };
  }

  const apiError = getApiErrorObject_(data);

  if (httpStatus < 200 || httpStatus >= 300 || apiError) {
    const apiCode = apiError && apiError.error_code !== undefined
      ? Number(apiError.error_code)
      : null;
    const apiMessage = apiError && apiError.error_message
      ? String(apiError.error_message)
      : '';

    return {
      ok: false,
      httpStatus: httpStatus,
      apiErrorCode: apiCode,
      message: context + ' failed' +
        ' (HTTP ' + httpStatus + (apiCode ? ', API ' + apiCode : '') + ')' +
        (apiMessage ? ': ' + apiMessage : '.')
    };
  }

  return {
    ok: true,
    httpStatus: httpStatus,
    apiErrorCode: null,
    data: data
  };
}

function getApiErrorObject_(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (data.error && typeof data.error === 'object') {
    return data.error;
  }

  return null;
}

function getApiErrorFromObject_(data) {
  const error = getApiErrorObject_(data);
  if (!error) {
    return '';
  }

  const code = error.error_code !== undefined ? 'API ' + error.error_code + ': ' : '';
  return code + (error.error_message || 'Unknown API error');
}

function isBulkCapabilityError_(error) {
  return Number(error && error.httpStatus) === 401 ||
    Number(error && error.apiErrorCode) === 401;
}

/**
 * Writes only recognized API field columns. Other columns remain untouched.
 * Successful lookups replace output cells with static values. If a requested
 * field is not present in a successful API response, that output cell is
 * cleared to avoid leaving stale data from an earlier lookup.
 */
function writeResults_(sheet, selection, selectedRows, mappings, results, errors) {
  const requestedFields = new Set(mappings.map(function (item) { return item.field; }));
  const returnedFields = new Set();
  let updatedRows = 0;
  let failedRows = 0;

  selectedRows.forEach(function (item) {
    if (results[item.ip]) {
      updatedRows++;
    } else if (errors[item.ip]) {
      failedRows++;
    }
  });

  mappings.forEach(function (mapping) {
    const outputRange = sheet.getRange(
      selection.getRow(),
      mapping.column,
      selection.getNumRows(),
      1
    );

    // Preserve cells for blank IP rows and failed lookups.
    const outputValues = outputRange.getValues();

    selectedRows.forEach(function (item) {
      const result = results[item.ip];

      if (!result) {
        return;
      }

      const fieldInfo = getPathInfo_(result, mapping.field);

      if (fieldInfo.found) {
        returnedFields.add(mapping.field);
        outputValues[item.offset][0] = normalizeCellValue_(fieldInfo.value);
      } else {
        // Successful lookup, but this field was not returned by the account/API.
        outputValues[item.offset][0] = '';
      }
    });

    outputRange.setValues(outputValues);
  });

  const unavailableFields = [...requestedFields].filter(function (field) {
    return !returnedFields.has(field);
  });

  return {
    updatedRows: updatedRows,
    failedRows: failedRows,
    unavailableFields: unavailableFields
  };
}

/**
 * Reads nested fields using dot notation, for example proxy.is_vpn.
 * `found` remains true for valid values such as false, 0, "", or null.
 */
function getPathInfo_(object, path) {
  if (
    object === null ||
    object === undefined ||
    typeof object !== 'object'
  ) {
    return { found: false, value: undefined };
  }
	   
   
   

  // Support a dotted key returned literally by an API.
  if (Object.prototype.hasOwnProperty.call(object, path)) {
    return { found: true, value: object[path] };
  }
   
				 
   
	  
	   
   
   

  // Otherwise traverse a normal nested object.
   
	  
		  
  
   
  const parts = String(path).split('.');
  let current = object;

  for (let i = 0; i < parts.length; i++) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, parts[i])
    ) {
	 
	  
      return { found: false, value: undefined };
  
    }

    current = current[parts[i]];
  }

	
	
  return { found: true, value: current };
 
}

/**
 * Converts API values into safe static cell values.
 */
function normalizeCellValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string' && value.charAt(0) === '=') {
    // Prevent an API string from becoming a spreadsheet formula.
    return "'" + value;
  }

  return value;
}

function showLookupSummary_(lookup, selectedRows, writeSummary) {
									
  const spreadsheet = SpreadsheetApp.getActive();
  const uniqueIps = new Set(selectedRows.map(function (item) { return item.ip; })).size;

  const totalRows = selectedRows.length;
  const updatedRows = writeSummary.updatedRows;
  const failedRows = writeSummary.failedRows;
  const unavailableFields = writeSummary.unavailableFields || [];

  // Keep the toast short so it is not clipped by the Sheets UI.
  let toastMessage;

  if (failedRows > 0) {
    toastMessage =
      updatedRows + ' of ' + totalRows + ' row' + (totalRows === 1 ? '' : 's') +
      ' processed. ' + failedRows + ' failed.';
  } else if (unavailableFields.length > 0) {
    toastMessage =
      totalRows + ' row' + (totalRows === 1 ? '' : 's') +
      ' processed. ' + unavailableFields.length +
      ' requested field' + (unavailableFields.length === 1 ? '' : 's') +
      ' not returned.';
  } else {
    toastMessage =
      totalRows + ' row' + (totalRows === 1 ? '' : 's') +
      ' processed via ' + lookup.mode + '.';
  }

  spreadsheet.toast(
    toastMessage,
    'IP2Location.io',
    5
  );

																				
															   
  const needsDetails =
    failedRows > 0 ||
    unavailableFields.length > 0;

  if (!needsDetails) {
    if (lookup.notice) {
      console.log('IP2Location.io: ' + lookup.notice);
    }
    return;
  }

  const messages = [
    'Mode: ' + lookup.mode,
    'Selected rows: ' + totalRows,
    'Unique IPs queried: ' + uniqueIps,
    'Rows updated: ' + updatedRows,
    'Rows failed: ' + failedRows
  ];

  if (lookup.notice) {
    messages.push('Notice:\n' + lookup.notice);
  }

  if (unavailableFields.length > 0) {
    const maxFieldsShown = 20;
    const shownFields = unavailableFields.slice(0, maxFieldsShown);
		

    let missingMessage =
      'Requested fields not returned by any successful lookup:\n\n' +
      '• ' + shownFields.join('\n• ');

    if (unavailableFields.length > shownFields.length) {
      missingMessage +=
        '\n• ... +' +
        (unavailableFields.length - shownFields.length) +
        ' more';
    }

    missingMessage +=
      '\n\nThese fields may not be available with the current API access ' +
      'or for the queried data.';

    messages.push(missingMessage);
  }

  if (failedRows > 0) {
    const maxErrorsShown = 10;
    const failedExamples = [];
    const seenErrorIps = new Set();

    selectedRows.forEach(function (item) {
      if (
        lookup.errors[item.ip] &&
        !seenErrorIps.has(item.ip) &&
        failedExamples.length < maxErrorsShown
      ) {
        seenErrorIps.add(item.ip);
        failedExamples.push(
          '• ' + item.ip + '\n  ' + lookup.errors[item.ip]
        );
      }
    });

    if (failedExamples.length > 0) {
      const totalUniqueFailedIps = Object.keys(lookup.errors || {}).filter(function (ip) {
        return selectedRows.some(function (item) {
          return item.ip === ip;
        });
      }).length;

      let errorMessage =
        'Failed IPs:\n\n' +
        failedExamples.join('\n\n');

      if (totalUniqueFailedIps > failedExamples.length) {
        errorMessage +=
          '\n\n... +' +
          (totalUniqueFailedIps - failedExamples.length) +
          ' more failed IP' +
          (totalUniqueFailedIps - failedExamples.length === 1 ? '' : 's');
      }

      messages.push(errorMessage);
    }
  }

  const fullMessage = messages.join('\n\n');
  console.log(fullMessage);

  showLookupDetails_(
    failedRows > 0
      ? 'Lookup completed with errors'
      : 'Lookup completed with notices',
	
    fullMessage
				   
  
  );
}

/**
 * Shows long lookup details without blocking the spreadsheet UI.
 */
function showLookupDetails_(title, message) {
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:16px;line-height:1.45;">' +
      '<div style="font-size:18px;font-weight:600;margin-bottom:14px;">' +
        escapeHtml_(title) +
      '</div>' +
      '<div style="white-space:pre-wrap;overflow-wrap:anywhere;">' +
        escapeHtml_(message) +
      '</div>' +
    '</div>'
  )
    .setWidth(560)
    .setHeight(460);

  SpreadsheetApp.getUi().showModelessDialog(
    html,
    'IP2Location.io'
  );
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getErrorMessage_(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.message) {
    return String(error.message);
  }

  return String(error);
}
