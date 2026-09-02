# Configuración del RSVP con Google Apps Script

## 1. Preparar Google Sheets

En la pestaña `Sheet1`, la fila 1 debe contener exactamente:

| A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- |
| `invite_id` | `group_name` | `group_token` | `invitation_name` | `person_name` | `attending` | `responded_at` |

Para este sitio, cada fila debe usar exactamente `FMM01` en la columna `group_token`. El token distingue este grupo de otros que puedan compartir el mismo Sheet; no es una contraseña y nunca se muestra en la interfaz.

No publiques el Sheet ni cambies su configuración de acceso. El Web App será el único intermediario.

## 2. Crear el Apps Script

1. Abre el Google Sheet.
2. Selecciona **Extensiones → Apps Script**.
3. En el archivo `Code.gs`, borra el contenido inicial.
4. Copia y pega todo el contenido de `google-apps-script/Code.gs` de este repositorio.
5. Guarda el proyecto y ponle un nombre, por ejemplo `Fiesta60 RSVP`.

## 3. Inicializar y autorizar

1. En el selector de funciones de Apps Script, elige `setupRsvpBackend`.
2. Pulsa **Ejecutar**.
3. Google solicitará autorización para que el script lea y modifique el Sheet. Autoriza con la cuenta propietaria de la hoja.
4. Confirma que el registro de ejecución termine correctamente.

Esta función valida los encabezados y crea un secreto privado en las propiedades del script. No copies ese secreto al sitio web.

## 4. Publicar como Web App

1. En Apps Script, selecciona **Implementar → Nueva implementación**.
2. Junto a **Seleccionar tipo**, elige **Aplicación web**.
3. Escribe una descripción, por ejemplo `RSVP Fiesta60 v1`.
4. En **Ejecutar como**, selecciona **Yo**.
5. En **Quién tiene acceso**, selecciona **Cualquier usuario**. Si aparece la opción **Cualquier usuario, incluso anónimo**, utiliza esa opción para que los invitados no tengan que iniciar sesión.
6. Pulsa **Implementar** y completa la autorización si Google la solicita.
7. Copia la URL de la aplicación web que termina en `/exec`. No uses la URL de prueba que termina en `/dev`.

## 5. Conectar el sitio

1. Abre `script.js`.
2. Busca la constante claramente marcada al principio:

   ```js
   const RSVP_API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```

3. Sustituye únicamente el texto entre comillas por la URL `/exec` copiada en el paso anterior.
4. Confirma que la constante del grupo sea:

   ```js
   const RSVP_GROUP_TOKEN = "FMM01";
   ```

5. Guarda, prueba y después publica el cambio en GitHub Pages.

## 6. Probar antes de publicar

1. Busca un apellido presente en `invitation_name` o `person_name`.
2. Confirma que se muestre una sola tarjeta por `invite_id`.
3. Selecciona la invitación y marca algunas personas.
4. Envía la respuesta y revisa que las columnas F y G se actualicen para todas las personas de esa invitación.
5. Busca la misma invitación otra vez. Las personas con `YES` deben aparecer marcadas y las personas con `NO` desmarcadas.
6. Cambia la selección y verifica que la respuesta anterior se sobrescriba con una nueva fecha.

## Actualizar el backend después

Cuando modifiques `Code.gs`, abre **Implementar → Administrar implementaciones**, edita la implementación existente, selecciona **Nueva versión** y vuelve a implementar. No crees otro Web App. La URL `/exec` puede permanecer igual.
