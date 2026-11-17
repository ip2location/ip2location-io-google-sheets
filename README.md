# IP2Location.io for Google Sheets

Look up IPv4 and IPv6 addresses directly in **Google Sheets** using [IP2Location.io](https://www.ip2location.io/). This Google Apps Script enriches selected rows with IP geolocation, ASN, ISP, and proxy information based on your spreadsheet column headers.

Results are saved as **static cell values**, not formulas. You can use the script without an API key, or add a key for plan-dependent data and Bulk API access.

## Features

- Highlight only the IP addresses you want to process.
- Use row 1 headers to choose which IP2Location.io fields go into which columns.
- Supports nested fields with dot notation, such as `as_info.as_name` and `proxy.is_vpn`.
- Supports whole JSON objects and arrays in a single cell, such as `time_zone_info`, `proxy`, or `continent.hemisphere`.
- Stores each user's API key persistently with Google Apps Script `UserProperties`.
- Works without an API key by using the IP2Location.io keyless Normal API.
- Works with Free API keys through the Normal API.
- Automatically attempts the Bulk API for multi-IP lookups when an API key is configured.
- Caches Bulk API capability per user so a Free/non-Bulk key is not tested on every lookup.
- Automatically splits Bulk requests into batches of up to 1,000 IPs.
- Uses `UrlFetchApp.fetchAll()` in chunks for Normal API lookups.
- Deduplicates repeated IPs in the selection so the same IP is queried only once per run.
- Leaves unrelated spreadsheet columns untouched.
- Clears stale output values when a successful lookup does not return a requested field.

## Example

Set up a sheet like this:

| IP | country_code | country_name | city_name | isp | as_info.as_name | proxy.is_vpn |
|---|---|---|---|---|---|---|
| 8.8.8.8 | | | | | | |
| 1.1.1.1 | | | | | | |
| 9.9.9.9 | | | | | | |

Highlight the IP cells you want to process, for example `A2:A4`, and then choose:

**IP2Location.io -> Lookup Selected IPs**

The script reads the selected column as the input IP column and writes API results into columns whose row 1 headers match known IP2Location.io fields.

The IP column does **not** need to be column A. If your IP addresses are in column D, simply highlight the cells in column D.

## Installation

1. Open the Google Sheet where you want to use IP2Location.
2. Go to **Extensions → Apps Script**.
3. The Apps Script editor will open in a new browser tab.  
   The script is automatically bound to the Google Sheet you opened it from.
4. Delete the sample code in the editor.
5. Copy the contents of `Code.gs` into the Apps Script editor.
6. Click **Save**.
7. You do **not** need to click **Deploy**.
8. Return to the Google Sheet and reload the page.
9. A new **IP2Location.io** menu should appear.
10. The first time you use the menu, Google may ask you to authorize the script.

Saving the script does not trigger an IP lookup. `onOpen()` only adds the custom menu when the spreadsheet is opened or reloaded.

## Usage

### 1. Add output headers

Put IP2Location.io field names in row 1.

Examples:

```text
country_code
country_name
region_name
city_name
latitude
longitude
zip_code
time_zone
asn
as
isp
domain
is_proxy
fraud_score
```

Nested API objects can be addressed with dot notation:

```text
as_info.as_name
as_info.as_domain
continent.name
continent.hemisphere
country.capital
time_zone_info.olson
proxy.is_vpn
proxy.is_tor
proxy.is_data_center
```

Whole objects can also be used as headers:

```text
as_info
continent
country
region
city
time_zone_info
geotargeting
proxy
```

Objects and arrays are written as JSON text in a single cell. For example:

```text
continent.hemisphere
-> ["north","east"]

time_zone_info
-> {"olson":"Asia/Kuala_Lumpur","gmt_offset":28800,...}
```

Headers are matched case-insensitively after trimming whitespace.

Columns with headers that are not recognized as IP2Location.io fields are ignored and never modified.

### 2. Highlight IP addresses

Highlight one or more IP addresses in a **single column**.

For example:

```text
A2:A100
```

or:

```text
D5:D25
```

Blank selected cells are ignored.

For safety, the script accepts at most **10,000 selected rows per run**. This prevents accidental whole-column selections such as `A:A` from making Google Sheets unresponsive.

### 3. Run the lookup

Choose:

**IP2Location.io -> Lookup Selected IPs**

Returned data is written directly into the matching columns as static values.

## API key configuration

An API key is optional.

Choose:

**IP2Location.io -> Set / Update API Key**

The key is stored using:

```javascript
PropertiesService.getUserProperties()
```

This means the key is associated with the current/effective user within this Apps Script project rather than being stored in a spreadsheet cell or shared as a script-wide property.

The API key is sent to IP2Location.io using an HTTP `Authorization: Bearer` header rather than being placed in the request URL.

To remove the stored key, choose:

**IP2Location.io -> Remove API Key**

## API selection logic

The script does not need to know the user's named IP2Location.io plan.

It selects an API mode based on available capability:

```text
No API key
    -> Normal API (keyless)

API key + 1 selected unique IP
    -> Normal API

API key + 2 or more selected unique IPs
    -> Bulk capability known available
         -> Bulk API

    -> Bulk capability known unavailable
         -> Normal API

    -> Bulk capability unknown
         -> Try Bulk API once
              -> Success: cache Bulk available
              -> Bulk 401: verify the key with Normal API
                   -> Normal succeeds: cache Bulk unavailable and use Normal
                   -> Normal fails: report the API error
              -> Other Bulk failure: use Normal for this lookup without
                 changing the cached capability
```

### Bulk capability cache

IP2Location.io does not currently provide an endpoint used by this script to ask whether an API key belongs to a paid/Bulk-enabled plan.

The script therefore stores one of these capability states in `UserProperties`:

```text
unknown
true
false
```

If an account is upgraded or downgraded while keeping the same API key, choose:

**IP2Location.io -> Recheck Bulk API Access**

This clears the cached capability. The next multi-IP lookup will test Bulk access again.

Changing the saved API key also automatically clears the Bulk capability cache.

> When Bulk returns an ambiguous `401`, the script uses one Normal API lookup for `8.8.8.8` to verify that the configured key itself still works before marking Bulk as unavailable.

## Normal API behavior

Normal API requests use:

```text
https://api.ip2location.io/
```

Without a configured API key, the script uses keyless mode.

When an API key is configured, it is sent as a Bearer token.

For multiple Normal API lookups, the script uses `UrlFetchApp.fetchAll()` in chunks of 100 requests instead of waiting for every HTTP request sequentially.

The chunk size can be changed in `Code.gs`:

```javascript
NORMAL_FETCHALL_BATCH_SIZE: 100
```

The maximum number of selected rows processed in one run is:

```javascript
MAX_SELECTED_ROWS: 10000
```

## Bulk API behavior

Bulk API requests use:

```text
https://bulk.ip2location.io/
```

IP2Location.io currently supports up to 1,000 IPv4/IPv6 addresses per Bulk request. The script automatically splits larger selections into batches:

```javascript
BULK_MAX_IPS: 1000
```

When all requested sheet headers are documented Bulk `fields` values, the script sends only those requested fields to the Bulk API.

If a requested field is recognized by the script but is not in the current Bulk `fields` whitelist, the script omits the `fields` parameter and lets the Bulk API return all data available to the account. This makes the behavior safer for fields that are not selectable through the Bulk `fields` parameter.

## Different plans and different fields

The script is intentionally plan-agnostic.

For example, a user may create these headers:

```text
country_name | isp | mobile_brand | proxy.is_vpn | fraud_score
```

The script requests the IP data and checks what the API actually returned.

- If a requested field exists, its value is written to the cell.
- Valid values such as `false`, `0`, an empty string, or `null` are handled correctly.
- If a successful lookup does not return a requested field, that output cell is cleared.
- If a field is not returned for any successful IP in the selection, the completion message notes that it may not be available with the current API access or queried data.

There is no `if plan === ...` logic in the code.

## Unrelated columns

You can keep other data in the same sheet:

| IP | Customer ID | country_name | Notes | proxy.is_vpn |
|---|---|---|---|---|
| 8.8.8.8 | CUST-001 | | Important account | |

`Customer ID` and `Notes` are not recognized API field headers, so the script leaves those columns untouched.

## Duplicate IPs

If the highlighted range contains the same IP multiple times, the script queries that unique IP only once during the run and writes the same result back to every selected row containing it.

Example:

```text
8.8.8.8
1.1.1.1
8.8.8.8
```

This results in two unique API lookups rather than three.

## Errors and completion messages

Failed IP lookups do not overwrite the existing output cells for those rows.

After each lookup, the script shows a short **toast** with the basic result so the spreadsheet remains usable.

If some IPs fail or requested fields are not returned, the script opens a **modeless details dialog** instead of a blocking alert. The spreadsheet can still be used while this dialog is open.

The details dialog can show:

- Lookup mode.
- Selected rows and unique IPs queried.
- Rows updated and rows failed.
- Up to 20 requested fields that were not returned by any successful lookup.
- Up to 10 failed IP examples and their error messages.

Successful rows are still written even when other selected IPs fail in Normal API mode.

## API status

Choose:

**IP2Location.io -> API Status**

The dialog shows:

- Whether an API key is configured.
- Whether Bulk API capability is currently unknown, cached as available, or cached as unavailable.

The API key itself is never displayed by this menu.

## Header row

The default header row is row 1:

```javascript
HEADER_ROW: 1
```

Change `HEADER_ROW` in `IP2LOCATION_IO_CONFIG` if your sheet uses a different row for headers.

## Updating the supported field list

`Code.gs` contains two field lists:

```javascript
IP2LOCATION_IO_KNOWN_FIELDS
IP2LOCATION_IO_BULK_FILTER_FIELDS
```

`IP2LOCATION_IO_KNOWN_FIELDS` determines which sheet headers the script is allowed to write to.

`IP2LOCATION_IO_BULK_FILTER_FIELDS` determines which requested headers can safely be sent through the Bulk API `fields` parameter.

If IP2Location.io introduces new fields, update these lists based on the current API documentation.

## Current IP2Location.io API notes

At the time this README was prepared:

- The Normal API supports keyless lookup.
- IP2Location.io documents up to 1,000 keyless Normal API queries per day.
- The Free plan provides a higher monthly Normal API allowance with an API key.
- Bulk Query is a paid-plan feature.
- Bulk requests support up to 1,000 IP addresses per request.
- Different plans return different numbers/types of IP attributes.

Always check the current IP2Location.io documentation and pricing because plans, quotas, available fields, and API behavior may change.

### IP2Location.io documentation

- Normal API: https://www.ip2location.io/ip2location-documentation
- Bulk API: https://www.ip2location.io/ip2location-bulk-documentation
- Pricing and plan features: https://www.ip2location.io/pricing

### Google Apps Script documentation

- Properties Service: https://developers.google.com/apps-script/guides/properties
- `PropertiesService.getUserProperties()`: https://developers.google.com/apps-script/reference/properties/properties-service
- `UrlFetchApp`: https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
- Custom menus: https://developers.google.com/apps-script/guides/menus

## Security notes

- Do not hard-code customer API keys in `Code.gs`.
- Do not put API keys into sheet cells.
- The script stores the key in Apps Script `UserProperties` for the current/effective user.
- The key is transmitted to IP2Location.io through HTTPS using a Bearer authorization header.
- Anyone modifying this Apps Script project should review the code before deployment, because the script itself necessarily has access to the current user's stored key when making an authenticated API request.

## Related IP2Location Products

| Product | Purpose |
|---|---|
| [IP2Location.io](https://www.ip2location.io/) | Hosted IP geolocation, ASN, and network intelligence APIs. |
| [IP2Location LITE](https://www.ip2location.com/database/lite) | Free downloadable IP geolocation and ASN databases for offline use. |
| [IP2Location Database](https://www.ip2location.com/database/ip2location) | Commercial offline IP geolocation databases. |
| [IP2Proxy](https://www.ip2location.com/database/proxy) | IP proxy, VPN, TOR and anonymizer intelligence. |
| [IP2WHOIS](https://www.ip2whois.com/) | Domain WHOIS lookup services. |

## Support

- [IP2Location.io API documentation](https://www.ip2location.io/ip2location-documentation)
- [API plans and pricing](https://www.ip2location.io/pricing)
- [Report issues or request features](https://github.com/ip2location/ip2location-io-google-sheets/issues)

## License

Licensed under the **MIT License**. See [LICENSE](https://github.com/ip2location/ip2location-io-google-sheets/blob/main/LICENSE).
