const SPREADSHEET_ID = '19Oa-uMdjDQ6_ILbuZieI3Ajlqx6LHVPz6i2jGFL6q3I';
const SHEET_NAME = 'Sheet1';
const ALLOWED_GROUP_TOKENS = ['FMM01', 'FMA02', 'AMK01', 'BCN01', 'DFW01'];
const EXPECTED_HEADERS = ['invite_id', 'group_name', 'group_token', 'invitation_name', 'person_name', 'attending', 'responded_at'];
const MAX_SEARCH_RESULTS = 12;
const MAX_PEOPLE_PER_INVITATION = 50;

/**
 * Run this function once from the Apps Script editor before deploying.
 * It validates the sheet and creates the private signing secret used for
 * opaque invitation/person keys. The secret never leaves Apps Script.
 */
function setupRsvpBackend() {
  getSheet_();
  ALLOWED_GROUP_TOKENS.forEach(function(groupToken) {
    if (readGuests_(groupToken).length === 0) {
      throw new Error('No se encontraron invitados para el group_token ' + groupToken + '.');
    }
  });
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('RSVP_SECRET')) {
    properties.setProperty('RSVP_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  console.log('RSVP backend ready.');
}

function doGet(e) {
  try {
    const action = cleanString_(e && e.parameter && e.parameter.action);
    const groupToken = validateGroupToken_(e && e.parameter && e.parameter.groupToken);
    if (action === 'search') {
      return json_(searchInvitations_(e.parameter.q, groupToken));
    }
    if (action === 'invitation') {
      return json_(getInvitation_(e.parameter.key, groupToken));
    }
    return json_({ ok: false, error: 'Solicitud no válida.' });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: safeError_(error) });
  }
}

function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents;
    if (!rawBody || rawBody.length > 12000) {
      throw new Error('La solicitud está vacía o es demasiado grande.');
    }

    const body = JSON.parse(rawBody);
    if (!body || body.action !== 'submit') {
      throw new Error('Solicitud no válida.');
    }

    return json_(saveRsvp_(body));
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: safeError_(error) });
  }
}

function searchInvitations_(rawQuery, groupToken) {
  const query = normalize_(rawQuery);
  if (query.length < 3) {
    throw new Error('Escribe al menos 3 letras para buscar.');
  }
  if (query.length > 80) {
    throw new Error('La búsqueda es demasiado larga.');
  }

  const guests = readGuests_(groupToken);
  const groups = groupGuests_(guests);
  const results = [];

  groups.forEach(function(group) {
    const invitationMatches = normalize_(group.invitationName).indexOf(query) !== -1;
    const personMatches = group.people.some(function(person) {
      return normalize_(person.personName).indexOf(query) !== -1;
    });

    if (invitationMatches || personMatches) {
      results.push({
        invitationName: group.invitationName,
        selectionKey: selectionKey_(group.groupToken, group.inviteId),
      });
    }
  });

  results.sort(function(a, b) {
    return a.invitationName.localeCompare(b.invitationName, 'es', { sensitivity: 'base' });
  });

  return { ok: true, results: results.slice(0, MAX_SEARCH_RESULTS) };
}

function getInvitation_(rawSelectionKey, groupToken) {
  const selectionKey = validateOpaqueKey_(rawSelectionKey);
  const group = findGroupBySelectionKey_(selectionKey, groupGuests_(readGuests_(groupToken)));
  if (!group) {
    throw new Error('No encontramos esa invitación. Vuelve a buscarla.');
  }

  return {
    ok: true,
    invitationName: group.invitationName,
    hasResponded: group.people.some(function(person) {
      return person.attending === 'YES' || person.attending === 'NO' || person.respondedAt;
    }),
    people: group.people.map(function(person) {
      return {
        personName: person.personName,
        personKey: personKey_(group.groupToken, group.inviteId, person.personName, person.occurrence),
        attending: person.attending === 'YES',
      };
    }),
  };
}

function saveRsvp_(body) {
  const groupToken = validateGroupToken_(body.groupToken);
  const selectionKey = validateOpaqueKey_(body.selectionKey);
  if (!Array.isArray(body.selectedPeople)) {
    throw new Error('La selección de invitados no es válida.');
  }
  if (body.selectedPeople.length > MAX_PEOPLE_PER_INVITATION) {
    throw new Error('La selección contiene demasiadas personas.');
  }

  const selectedKeys = {};
  body.selectedPeople.forEach(function(rawKey) {
    const key = validateOpaqueKey_(rawKey);
    selectedKeys[key] = true;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const groups = groupGuests_(readGuestsFromSheet_(sheet, groupToken));
    const group = findGroupBySelectionKey_(selectionKey, groups);
    if (!group) {
      throw new Error('No encontramos esa invitación. Vuelve a buscarla.');
    }

    const validKeys = {};
    group.people.forEach(function(person) {
      validKeys[personKey_(group.groupToken, group.inviteId, person.personName, person.occurrence)] = person;
    });

    Object.keys(selectedKeys).forEach(function(key) {
      if (!validKeys[key]) {
        throw new Error('Una de las personas seleccionadas no pertenece a esta invitación.');
      }
    });

    const respondedAt = new Date();
    const confirmedNames = [];
    group.people.forEach(function(person) {
      const key = personKey_(group.groupToken, group.inviteId, person.personName, person.occurrence);
      const attending = selectedKeys[key] ? 'YES' : 'NO';
      sheet.getRange(person.sheetRow, 6, 1, 2).setValues([[attending, respondedAt]]);
      if (attending === 'YES') confirmedNames.push(person.personName);
    });
    SpreadsheetApp.flush();

    return { ok: true, confirmedNames: confirmedNames };
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No se encontró la pestaña Sheet1.');

  const headers = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0]
    .map(function(value) { return cleanString_(value); });
  EXPECTED_HEADERS.forEach(function(expected, index) {
    if (headers[index] !== expected) {
      throw new Error('Revisa los encabezados de las columnas A:G en Sheet1.');
    }
  });
  return sheet;
}

function readGuests_(groupToken) {
  return readGuestsFromSheet_(getSheet_(), groupToken);
}

function readGuestsFromSheet_(sheet, groupToken) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, EXPECTED_HEADERS.length).getDisplayValues();
  const occurrences = {};
  const guests = [];

  values.forEach(function(row, index) {
    const inviteId = cleanString_(row[0]);
    const groupName = cleanString_(row[1]);
    const rowGroupToken = cleanString_(row[2]);
    const invitationName = cleanString_(row[3]);
    const personName = cleanString_(row[4]);
    if (!inviteId && !groupName && !rowGroupToken && !invitationName && !personName) return;
    if (rowGroupToken !== groupToken) return;
    if (!inviteId || !groupName || !invitationName || !personName) return;

    const occurrenceKey = JSON.stringify([rowGroupToken, inviteId, personName]);
    occurrences[occurrenceKey] = (occurrences[occurrenceKey] || 0) + 1;
    guests.push({
      sheetRow: index + 2,
      inviteId: inviteId,
      groupToken: rowGroupToken,
      invitationName: invitationName,
      personName: personName,
      attending: cleanString_(row[5]).toUpperCase(),
      respondedAt: cleanString_(row[6]),
      occurrence: occurrences[occurrenceKey],
    });
  });
  return guests;
}

function groupGuests_(guests) {
  const byInvite = {};
  const groups = [];
  guests.forEach(function(guest) {
    const groupKey = JSON.stringify([guest.groupToken, guest.inviteId]);
    if (!byInvite[groupKey]) {
      byInvite[groupKey] = {
        inviteId: guest.inviteId,
        groupToken: guest.groupToken,
        invitationName: guest.invitationName,
        people: [],
      };
      groups.push(byInvite[groupKey]);
    }
    byInvite[groupKey].people.push(guest);
  });
  return groups;
}

function findGroupBySelectionKey_(selectionKey, groups) {
  for (let index = 0; index < groups.length; index += 1) {
    if (selectionKey_(groups[index].groupToken, groups[index].inviteId) === selectionKey) return groups[index];
  }
  return null;
}

function selectionKey_(groupToken, inviteId) {
  return sign_(['invitation', groupToken, inviteId]);
}

function personKey_(groupToken, inviteId, personName, occurrence) {
  return sign_(['person', groupToken, inviteId, personName, occurrence]);
}

function sign_(parts) {
  const secret = PropertiesService.getScriptProperties().getProperty('RSVP_SECRET');
  if (!secret) throw new Error('Ejecuta setupRsvpBackend antes de publicar el Web App.');
  const bytes = Utilities.computeHmacSha256Signature(JSON.stringify(parts), secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function validateOpaqueKey_(value) {
  const key = cleanString_(value);
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(key)) {
    throw new Error('La invitación seleccionada no es válida.');
  }
  return key;
}

function validateGroupToken_(value) {
  const groupToken = cleanString_(value);
  if (ALLOWED_GROUP_TOKENS.indexOf(groupToken) === -1) {
    throw new Error('El grupo de invitación no es válido.');
  }
  return groupToken;
}

function normalize_(value) {
  return cleanString_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
}

function cleanString_(value) {
  return value == null ? '' : String(value).trim();
}

function safeError_(error) {
  const message = error && error.message ? String(error.message) : '';
  const allowed = [
    'Escribe al menos 3 letras para buscar.',
    'La búsqueda es demasiado larga.',
    'Solicitud no válida.',
    'La solicitud está vacía o es demasiado grande.',
    'No encontramos esa invitación. Vuelve a buscarla.',
    'La selección de invitados no es válida.',
    'La selección contiene demasiadas personas.',
    'Una de las personas seleccionadas no pertenece a esta invitación.',
    'La invitación seleccionada no es válida.',
    'El grupo de invitación no es válido.',
  ];
  if (allowed.indexOf(message) !== -1) return message;
  return 'No pudimos completar la solicitud. Intenta nuevamente.';
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
