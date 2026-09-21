// touch-music-card
//
// One Lovelace card for Music Assistant, built for touch panels and Google Nest
// Hub cast dashboards (1024x600): speakers, volume, now playing, tiles for the
// music you reach for, and search with an on-screen keyboard that drills down
// into albums, artists and playlists.
//
// It talks to Music Assistant directly - music_assistant.search to find things,
// music_assistant.play_media to start them, browse_media to open them - instead
// of going through a media_player abstraction. That is the whole reason it works
// with whatever providers you have enabled: local files, Jellyfin, Plex, Subsonic,
// YouTube Music, Spotify, radio. The card never knows which one answered.
//
// Two decisions worth knowing about:
//
//   on-screen keyboard   A cast dashboard on a Nest Hub has no keyboard, and
//                        speaking to it hands you back to Google and closes the
//                        dashboard. So the card brings its own keys.
//   volume_max           A soundbar can be loud at 20%. Mapping the whole slider
//                        onto 0-20% turns a useless first fifth into the full
//                        range. The card never writes a volume you did not ask for.
//
// https://github.com/mnrgrrt/touch-music-card - MIT licensed.

const VERSIE = '2.4.0';

const KLEIN = (u) => (u || '')
  .replace('ab67616d0000b273', 'ab67616d00004851')
  .replace('ab67616d00001e02', 'ab67616d00004851')
  .replace('mosaic.scdn.co/640/', 'mosaic.scdn.co/60/');

const GROOT = (u) => (u || '')
  .replace('ab67616d0000b273', 'ab67616d00001e02')
  .replace('mosaic.scdn.co/640/', 'mosaic.scdn.co/300/');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const SPEELT = ['playing', 'paused', 'buffering'];

// Music Assistant serves the covers it proxies itself over plain http, on its
// own address. On a dashboard opened over https - Nabu Casa, a reverse proxy -
// the browser refuses to load those as mixed content and you get an empty
// square with a console warning per image. An honest empty is better than a
// broken one, so such a url is treated as absent and the icon takes over.
// An http image on an https dashboard is blocked as mixed content. For a public
// site (a radio station's logo, say) the same file is almost always there over
// https too, so ask for that. An address on your own network - Music Assistant's
// imageproxy on http://192.168.x.x:8095 - has no https twin, so it is dropped
// and the tile falls back to its icon.
const LOKAAL = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]|[^.]+|.+\.(local|lan|home|internal))$/i;
const VEILIG = (u) => {
  const s = String(u || '');
  if (!s) return '';
  const https = typeof location !== 'undefined' && location.protocol === 'https:';
  if (!https || s.slice(0, 5).toLowerCase() !== 'http:') return s;
  const m = s.match(/^http:\/\/([^/:?#]+)(:\d+)?/i);
  if (!m || m[2] || LOKAAL.test(m[1])) return '';
  return 'https:' + s.slice(5);
};

// A Music Assistant uri is <provider>://<type>/<id>. The type is the half that
// tells us which library to look in.
const SOORT_VAN = (uri) => ((uri || '').split('://')[1] || '').split('/')[0] || '';

// How long a fetched library list stays good. Music Assistant does not change
// from second to second, and a cast dashboard is open for days: too short and
// the card hangs on the wire, too long and a new playlist stays invisible.
const BIB_TTL = 10 * 60 * 1000;
const BIB_MAX = 500;

const SOORTEN = [
  { key: 'track', lijst: true, veld: 'tracks' },
  { key: 'album', lijst: false, veld: 'albums' },
  { key: 'artist', lijst: false, veld: 'artists' },
  { key: 'playlist', lijst: false, veld: 'playlists' },
];

// Interface strings. The card picks the language of Home Assistant, or the
// one set with `language:` in the card config. Adding a language = copying
// one block below and translating it.
const TAAL = {
  en: {
    soort: { track: 'Tracks', album: 'Albums', artist: 'Artists', playlist: 'Playlists', radio: 'Radio stations' },
    zoeken: 'Search artist, album or track',
    toetsen: 'KEYS', verberg: 'HIDE', zoek: 'SEARCH',
    wissen: 'Clear', spatie: 'space',
    bezigZoeken: 'Searching...', geenResultaat: 'No results.',
    geenCats: 'No categories configured.',
    terug: 'Back', resultaten: 'Results', speelAlles: 'Play all',
    bezigOphalen: 'Loading...', geenNummers: 'No tracks found.',
    nummer: 'track', nummers: 'tracks', uur: 'h', minuut: 'min',
    stil: 'Nothing playing', geenSpeler: 'Player not found',
    speeltOp: 'playing on', shuffleTitel: 'Shuffle', herhaalTitel: 'Repeat',
    ed: {
      algemeen: 'General', zones: 'Speakers', cats: 'Categories', links: 'Navigation buttons',
      config_entry_id: 'Music Assistant', height: 'Card height (pixels)',
      fill: 'Fill the screen below the card (ignores the height above)',
      fill_margin: 'Space at the bottom when filling (px)',
      volume_max: 'Maximum volume (%, also the end of the slider)',
      volume_start: 'Drop back to (%) when starting above that maximum',
      language: 'Language', limit: 'Search results per type',
      search_types: 'Searchable', tile_action: 'Tapping a tile',
      keyboard: 'On-screen keyboard', arrows: 'Scroll buttons next to lists',
      transfer_on_switch: 'Move the queue when switching speaker',
      retry_next: 'Re-send skip if nothing happens (Chromecast)',
      automatisch: 'Follow Home Assistant', openen: 'Show its tracks', afspelen: 'Play it',
      naam: 'Name', entity: 'Player', volume: 'Volume goes to (optional)', icon: 'Icon',
      turn_off: 'First switch off (optional)', unjoin: 'First detach (optional)',
      joinLeader: 'First group onto (optional)', joinMembers: 'these speakers',
      uri: 'Media id', image: 'Cover image URL (optional)',
      uriHint: 'A Music Assistant media id, for example library://playlist/65. '
        + 'Developer tools > Actions > "Music Assistant: Search" returns the id of '
        + 'anything you search for - see the README.',
      play: 'Play straight away', radio: 'Radio mode',
      pad: 'Dashboard path', tegels: 'Tiles',
      zoneToe: 'Add speaker', catToe: 'Add category', tegelToe: 'Add tile', linkToe: 'Add button',
      weg: 'Remove', naamloos: 'Unnamed',
      weergave: 'Display', spelenKop: 'Playing', zoekKop: 'Search',
      vullen: 'Tiles come from', bronHand: 'A list I make myself',
      bronAuto: 'Music Assistant fills it',
      media_type: 'What kind', order_by: 'Order', favorite: 'Favourites only',
      aantal: 'How many tiles', autoTegels: 'filled by Music Assistant',
      ordStandaard: 'Library order', ordRecent: 'Recently played',
      ordNieuw: 'Recently added', ordRandom: 'Random',
    },
  },
  nl: {
    soort: { track: 'Nummers', album: 'Albums', artist: 'Artiesten', playlist: 'Playlists', radio: 'Radiozenders' },
    zoeken: 'Zoek artiest, album of nummer',
    toetsen: 'TOETSEN', verberg: 'VERBERG', zoek: 'ZOEK',
    wissen: 'Wissen', spatie: 'spatie',
    bezigZoeken: 'Bezig met zoeken...', geenResultaat: 'Geen resultaten.',
    geenCats: 'Geen categorieen ingesteld.',
    terug: 'Terug', resultaten: 'Resultaten', speelAlles: 'Speel alles',
    bezigOphalen: 'Bezig met ophalen...', geenNummers: 'Geen nummers gevonden.',
    nummer: 'nummer', nummers: 'nummers', uur: 'u', minuut: 'min',
    stil: 'Niets aan het spelen', geenSpeler: 'Speler niet gevonden',
    speeltOp: 'speelt op', shuffleTitel: 'Willekeurige volgorde', herhaalTitel: 'Herhalen',
    ed: {
      algemeen: 'Algemeen', zones: 'Speakers', cats: 'Categorieen', links: 'Navigatieknoppen',
      config_entry_id: 'Music Assistant', height: 'Hoogte van de kaart (pixels)',
      fill: 'Vult het scherm onder de kaart (hoogte hierboven vervalt dan)',
      fill_margin: 'Ruimte onderaan bij vullen (px)',
      volume_max: 'Maximum volume (%, tevens einde van de schuif)',
      volume_start: 'Bij starten terugzetten naar (%) als het daarboven staat',
      language: 'Taal', limit: 'Zoekresultaten per soort',
      search_types: 'Waarop zoeken', tile_action: 'Tegel aantikken',
      keyboard: 'Schermtoetsenbord', arrows: 'Scrolknoppen naast lijsten',
      transfer_on_switch: 'Muziek meenemen bij wisselen van speaker',
      retry_next: 'Doorspoelen opnieuw sturen als er niets gebeurt (Chromecast)',
      automatisch: 'Die van Home Assistant', openen: 'Nummers tonen', afspelen: 'Meteen afspelen',
      naam: 'Naam', entity: 'Speler', volume: 'Volume gaat naar (optioneel)', icon: 'Icoon',
      turn_off: 'Eerst uitzetten (optioneel)', unjoin: 'Eerst loskoppelen (optioneel)',
      joinLeader: 'Eerst groeperen op (optioneel)', joinMembers: 'met deze speakers',
      uri: 'Media-id', image: 'Afbeelding-URL (optioneel)',
      uriHint: 'Een Music Assistant media-id, bijvoorbeeld library://playlist/65. '
        + 'Ontwikkelhulpmiddelen > Acties > "Music Assistant: Search" geeft het id '
        + 'van alles wat je zoekt - zie de README.',
      play: 'Meteen afspelen', radio: 'Radiomodus',
      pad: 'Pad naar weergave', tegels: 'Tegels',
      zoneToe: 'Speaker toevoegen', catToe: 'Categorie toevoegen',
      tegelToe: 'Tegel toevoegen', linkToe: 'Knop toevoegen',
      weg: 'Verwijderen', naamloos: 'Naamloos',
      weergave: 'Weergave', spelenKop: 'Afspelen', zoekKop: 'Zoeken',
      vullen: 'Tegels komen uit', bronHand: 'Een lijst die ik zelf maak',
      bronAuto: 'Music Assistant vult hem',
      media_type: 'Wat voor soort', order_by: 'Volgorde', favorite: 'Alleen favorieten',
      aantal: 'Hoeveel tegels', autoTegels: 'gevuld door Music Assistant',
      ordStandaard: 'Volgorde van de bibliotheek', ordRecent: 'Onlangs gespeeld',
      ordNieuw: 'Onlangs toegevoegd', ordRandom: 'Willekeurig',
    },
  },
};

const RIJEN = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const STYLE = `
:host {
  display:block;
  container-type:inline-size;
  --acc:#1DB954;
  --ov1:rgba(255,255,255,.05);
  --ov2:rgba(255,255,255,.09);
  --line:rgba(255,255,255,.07);
  --zacht:rgba(255,255,255,.55);
  --flauw:rgba(255,255,255,.34);
}
/* Light or dark follows the Home Assistant theme the card actually sits in, not the
   operating system: a light dashboard on a dark laptop must still get dark text. */
:host(.licht) { --ov1:rgba(0,0,0,.04); --ov2:rgba(0,0,0,.07); --line:rgba(0,0,0,.08);
                --zacht:rgba(0,0,0,.6); --flauw:rgba(0,0,0,.38); }
* { box-sizing:border-box; }

/* Alles staat op een enkel vlak - geen losse kaartjes binnen de kaart. */
.wrap { display:grid; grid-template-columns:288px 1px minmax(0,1fr); gap:18px;
        overflow:hidden; max-width:100%; height:var(--mc-h,556px);
        padding:16px 18px; border-radius:20px;
        background:var(--ha-card-background, var(--card-background-color, #1c1c1e));
        font-family:var(--primary-font-family,sans-serif);
        color:var(--primary-text-color,#e9e9ea); font-size:14px; }
.scheiding { background:var(--line); align-self:stretch; }
.col { display:flex; flex-direction:column; min-width:0; max-width:100%; }
.col > * { max-width:100%; min-width:0; }
.right { min-width:0; max-width:100%; overflow:hidden; }
button { font:inherit; color:inherit; border:0; cursor:pointer; background:none; padding:0;
         transition:opacity .12s, color .12s, background .12s, transform .08s; }
button:active { transform:scale(.96); }
.bezig { opacity:.35 !important; }
ha-icon { pointer-events:none; }

/* zones: een segmentregelaar, geen drie losse knoppen */
.zones { display:grid; grid-template-columns:repeat(var(--zn,3),minmax(0,1fr)); gap:2px;
         background:var(--ov1); border-radius:11px; padding:3px; flex:0 0 auto; }
.zones button { height:32px; border-radius:9px; display:flex; align-items:center;
                justify-content:center; position:relative; color:var(--flauw); }
.zones button.on { background:var(--ov2); color:var(--primary-text-color,#e9e9ea); }
.zones ha-icon { --mdc-icon-size:19px; }
.zones button.on ha-icon { color:var(--acc); }
.zones button.speelt::after { content:''; position:absolute; bottom:3px; width:3px; height:3px;
        border-radius:999px; background:var(--acc); }

/* de speler is de hoofdzaak van de linkerkolom */
.np { flex:1 1 auto; min-height:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; text-align:center; position:relative;
      padding:12px 0 4px; }
.np .glow { position:absolute; top:6px; left:50%; transform:translateX(-50%);
            width:180px; height:180px; border-radius:50%; background-size:cover;
            background-position:center; filter:blur(38px) saturate(1.5); opacity:.4; }
.np .art { position:relative; width:168px; height:168px; border-radius:12px; object-fit:cover;
           box-shadow:0 10px 26px rgba(0,0,0,.45); flex:0 0 auto; }
.np .leegart { position:relative; width:168px; height:168px; border-radius:12px;
               background:var(--ov1); display:flex; align-items:center; justify-content:center;
               flex:0 0 auto; }
.np .leegart ha-icon { --mdc-icon-size:46px; color:var(--flauw); }
.np .tx { position:relative; width:100%; padding:14px 2px 0; }
.np .t { font-size:16px; font-weight:600; letter-spacing:-.2px;
         white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.np .a { font-size:12.5px; color:var(--flauw); margin-top:2px;
         white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.np .op { font-size:10px; font-weight:700; letter-spacing:.5px; text-transform:uppercase;
          color:var(--acc); margin-top:6px; white-space:nowrap; overflow:hidden;
          text-overflow:ellipsis; }
.np .voort { position:relative; width:100%; padding:12px 2px 0; }
.np .vbaan { height:3px; border-radius:999px; background:var(--ov2); }
.np .vfill { height:3px; border-radius:999px; background:var(--zacht); width:0; }
.np .vtijd { display:flex; justify-content:space-between; font-size:10.5px;
             color:var(--flauw); margin-top:5px; font-variant-numeric:tabular-nums; }
.np .ctr { position:relative; display:flex; align-items:center; justify-content:center;
           gap:14px; margin-top:14px; width:100%; }
.np .ctr button { width:34px; height:34px; display:flex; align-items:center;
                  justify-content:center; color:var(--zacht); flex:0 0 auto; }
.np .ctr button:hover { color:var(--primary-text-color,#e9e9ea); }
.np .ctr button.hoofd { width:50px; height:50px; border-radius:999px;
                        background:var(--acc); color:#fff; }
.np .ctr button.hoofd ha-icon { --mdc-icon-size:26px; }
.np .ctr button.shuf.on, .np .ctr button.rep.on { color:var(--acc); }
.np .ctr ha-icon { --mdc-icon-size:22px; }
.np .ctr button.shuf ha-icon, .np .ctr button.rep ha-icon { --mdc-icon-size:18px; }

/* volume */
.volrow { display:flex; align-items:center; gap:12px; flex:0 0 auto; margin-top:14px; }
.volrow > button.vk { width:30px; height:30px; flex:0 0 auto; display:flex;
                      align-items:center; justify-content:center; color:var(--zacht); }
.volrow ha-icon { --mdc-icon-size:21px; }
.volrow .vollbl { flex:0 0 auto; min-width:36px; text-align:right; font-size:12px;
                  font-weight:600; color:var(--zacht); font-variant-numeric:tabular-nums; }
.volrow > button.slider { flex:1 1 0; width:auto; min-width:0; height:30px;
                          position:relative; display:flex; align-items:center; }
.slider .baan { position:absolute; left:0; right:0; height:6px; border-radius:999px;
                background:var(--ov2); }
.slider .fill { position:absolute; left:0; height:6px; border-radius:999px; background:var(--acc); }
.slider .knop { position:absolute; width:14px; height:14px; border-radius:999px;
                background:var(--primary-text-color,#fff);
                box-shadow:0 1px 3px rgba(0,0,0,.35); margin-left:-7px; }

/* tabs: onderstreping in plaats van pillen */
.chips { display:flex; gap:20px; flex-wrap:nowrap; min-width:0; max-width:100%;
         border-bottom:1px solid var(--line); flex:0 0 auto; overflow:hidden; }
.chips button { height:36px; font-size:13.5px; font-weight:600; color:var(--flauw);
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                border-bottom:2px solid transparent; margin-bottom:-1px; flex:0 1 auto; }
.chips button.on { color:var(--primary-text-color,#e9e9ea); border-bottom-color:var(--acc); }
.chips button.zoektab { margin-left:auto; flex:0 0 auto; display:flex; align-items:center; }
.chips button.zoektab ha-icon { --mdc-icon-size:19px; }

.tiles { min-height:0; max-width:100%; height:100%; overflow-y:auto; overflow-x:hidden; display:grid;
         grid-template-columns:repeat(4,minmax(0,1fr)); gap:11px 12px; align-content:start;
         padding-top:2px; scrollbar-width:none; }
.tiles::-webkit-scrollbar { display:none; }
.tile { display:flex; flex-direction:column; align-items:center; min-width:0; max-width:100%; }
.tile img, .tile .ph, .tile .ic { width:var(--tw,108px); height:var(--tw,108px); max-width:100%;
       border-radius:9px; object-fit:cover; }
.tile img { box-shadow:0 4px 12px rgba(0,0,0,.3); }
.tile .ph { background:var(--ov1); }
.tile .ic { background:var(--ov1); display:flex; align-items:center; justify-content:center; }
.tile .ic ha-icon { --mdc-icon-size:36px; color:var(--acc); opacity:.85; }
.tile span { font-size:11.5px; padding-top:6px; max-width:var(--tw,108px); color:var(--zacht);
             white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; }

.lijst { min-height:0; max-width:100%; height:100%; overflow-y:auto; overflow-x:hidden;
         display:flex; flex-direction:column; padding-top:2px; scrollbar-width:none; }
.lijst::-webkit-scrollbar { display:none; }
.rij { display:grid; grid-template-columns:46px minmax(0,1fr) auto; align-items:center; height:44px;
       flex:0 0 auto; max-width:100%; text-align:left; border-bottom:1px solid var(--line); }
.rij:last-child { border-bottom:0; }
.rij:hover { background:var(--ov1); }
.rij img { width:32px; height:32px; border-radius:4px; object-fit:cover; justify-self:center; }
.rij .tx { padding-left:2px; min-width:0; overflow:hidden; white-space:nowrap;
           text-overflow:ellipsis; font-size:13.5px; }
.rij .tx b { font-weight:600; }
.rij .tx span { color:var(--flauw); }
.rij .du { font-size:11.5px; color:var(--flauw); padding:0 8px 0 8px; font-variant-numeric:tabular-nums; }

/* zoekregel rechts */
.qbar { display:grid; grid-template-columns:26px minmax(0,1fr) auto; align-items:center;
        height:40px; max-width:100%; border-bottom:1px solid var(--line); flex:0 0 auto; }
.qbar ha-icon { --mdc-icon-size:18px; color:var(--flauw); }
.qbar .q { font-size:16px; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.qbar .q i { color:var(--flauw); font-style:normal; }
.qbar input.q { border:0; outline:none; background:transparent; color:inherit; width:100%; }
.qbar .kb { height:26px; padding:0 12px; border-radius:999px; background:var(--acc);
            color:#fff; font-size:11px; font-weight:700; letter-spacing:.4px; }

.kbd { display:flex; flex-direction:column; gap:5px; margin-top:8px; max-width:100%; }
.kbd .kr { display:flex; gap:5px; justify-content:center; min-width:0; }
.kbd button { flex:1 1 0; min-width:0; height:44px; border-radius:8px; background:var(--ov1);
              font-size:17px; font-weight:500; }
.kbd .num button { height:34px; font-size:14px; }
.kbd .wide button { font-size:13px; font-weight:600; }
.kbd .go { background:var(--acc) !important; color:#fff; font-size:13px !important;
           font-weight:700; letter-spacing:.3px; }

.kop { display:flex; gap:14px; align-items:center; min-width:0; max-width:100%;
       height:40px; border-bottom:1px solid var(--line); flex:0 0 auto; }
.kop .terug { flex:0 0 auto; display:flex; align-items:center; gap:5px; font-size:13px;
              color:var(--flauw); }
.kop .terug ha-icon { --mdc-icon-size:17px; }
.kop .titel { flex:1 1 0; min-width:0; font-size:15px; font-weight:600; white-space:nowrap;
              overflow:hidden; text-overflow:ellipsis; }
.kop .titel .aantal { font-size:12.5px; font-weight:400; color:var(--flauw); margin-left:8px; }
.kop .alles { flex:0 0 auto; height:28px; padding:0 14px; border-radius:999px; background:var(--acc);
              color:#fff; font-size:11.5px; font-weight:700; letter-spacing:.4px; }

.scrollbox { flex:1; min-height:0; max-width:100%; display:grid;
             grid-template-columns:minmax(0,1fr); gap:4px; margin-top:4px; }
.scrollbox.pijl { grid-template-columns:minmax(0,1fr) 34px; }
.pijlen { display:flex; flex-direction:column; gap:4px; min-height:0; }
.pijlen button { flex:0 0 44px; border-radius:8px; background:var(--ov1); color:var(--flauw);
                 display:flex; align-items:center; justify-content:center; }
.pijlen ha-icon { --mdc-icon-size:22px; }
/* dunne balk tussen de pijlen: laat zien waar je zit en is versleepbaar.
   Het hele vak is aanraakgebied; alleen het streepje in het midden is zichtbaar. */
.rail { flex:1 1 0; min-height:20px; width:100%; margin:2px 0; position:relative;
        opacity:0; transition:opacity .2s; touch-action:none; cursor:pointer; }
.rail.aan { opacity:1; }
.rail::before { content:''; position:absolute; top:0; bottom:0; left:50%; width:6px;
        margin-left:-3px; border-radius:999px; background:var(--ov1); }
.duim { position:absolute; left:50%; width:12px; margin-left:-6px; top:0; height:20%;
        border-radius:999px; background:var(--flauw);
        transition:top .12s linear, height .12s linear; }
.rail.sleep .duim { transition:none; background:var(--zacht); }
.leeg { color:var(--flauw); font-size:13px; padding:16px 2px; }
#melding { padding:2px 2px 0; min-height:14px; font-size:11.5px; color:#ff8a80; flex:0 0 auto; }

/* optionele navigatieknoppen naar andere views, binnen de kaart zelf */
.links { display:flex; gap:8px; flex-wrap:wrap; flex:0 0 auto; padding-top:8px;
         border-top:1px solid var(--line); margin-top:6px; }
.links:empty { display:none; border:0; margin:0; padding:0; }
.links button { display:flex; align-items:center; gap:5px; height:28px; padding:0 11px;
                border-radius:999px; background:var(--ov1); color:var(--zacht);
                font-size:12px; font-weight:600; }
.links ha-icon { --mdc-icon-size:15px; }

/* Smaller than a 1024x600 panel - a phone, a narrow column, or the preview
   pane of the card editor. Zonder dit wordt de rechterkolom onleesbaar smal. */
@container (max-width: 940px) {
  .wrap { grid-template-columns:250px 1px minmax(0,1fr); gap:14px; padding:14px; }
  .tiles { grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px 10px; }
  .np .art, .np .leegart { width:140px; height:140px; }
  .np .glow { width:150px; height:150px; }
  .chips { gap:14px; }
}
@container (max-width: 780px) {
  .wrap { grid-template-columns:210px 1px minmax(0,1fr); }
  .tiles { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .np .art, .np .leegart { width:118px; height:118px; }
  .np .ctr { gap:8px; }
  .kbd button { height:38px; font-size:15px; }
}
/* This width is the preview pane of the card editor. The card must keep its
   two columns here: the whole point of the preview is seeing the thing you are
   configuring, and a stacked version is not that thing. So squeeze rather than
   rearrange - a narrower left column, smaller artwork, tighter controls. */
@container (max-width: 560px) {
  .wrap { grid-template-columns:150px 1px minmax(0,1fr); gap:10px; padding:12px; }
  .np { padding:8px 0 2px; }
  .np .art, .np .leegart { width:104px; height:104px; }
  .np .glow { width:110px; height:110px; }
  .np .tx { padding-top:10px; }
  .np .t { font-size:14px; }
  .np .ctr { gap:4px; margin-top:10px; }
  .np .ctr button { width:26px; height:26px; }
  .np .ctr button.hoofd { width:40px; height:40px; }
  .np .ctr button.hoofd ha-icon { --mdc-icon-size:21px; }
  .np .ctr ha-icon { --mdc-icon-size:18px; }
  .volrow { gap:5px; margin-top:10px; }
  .volrow > button.vk { width:24px; height:24px; }
  .volrow ha-icon { --mdc-icon-size:17px; }
  .volrow .vollbl { min-width:28px; font-size:11px; }
  .chips { gap:10px; }
  .chips button { font-size:12px; }
  .tiles { gap:9px 8px; }
}
/* Genuinely narrow - a phone in portrait, or a one-column dashboard. Two
   columns stop being readable here, so stack them. Never hide one: on the
   card's own dashboard that half is the reason the card exists. */
@container (max-width: 400px) {
  .wrap { grid-template-columns:minmax(0,1fr); height:auto;
          min-height:var(--mc-h,556px); row-gap:14px; padding:14px; }
  .scheiding { display:none; }
  .right { min-height:340px; }
  .np .art, .np .leegart { width:132px; height:132px; }
}
`;

// Korte namen -> mdi. In de config mag je ook gewoon 'mdi:...' schrijven.
const KORT = {
  soundbar: 'mdi:soundbar', speaker: 'mdi:speaker', groep: 'mdi:surround-sound',
  keuken: 'mdi:countertop', serre: 'mdi:greenhouse',
  min: 'mdi:volume-minus', plus: 'mdi:volume-plus', shuffle: 'mdi:shuffle-variant',
  zoek: 'mdi:magnify', play: 'mdi:play', pause: 'mdi:pause',
  prev: 'mdi:skip-previous', next: 'mdi:skip-next', terug: 'mdi:arrow-left',
  hart: 'mdi:heart', muziek: 'mdi:music', klok: 'mdi:history', ster: 'mdi:star',
  plus2: 'mdi:playlist-plus', album: 'mdi:album', artiest: 'mdi:account-music',
  oneindig: 'mdi:infinity', lijst: 'mdi:playlist-music', radio: 'mdi:radio',
};

const svg = (naam) => {
  const n = String(naam || 'muziek');
  const mdi = n.indexOf(':') > 0 ? n : (KORT[n] || 'mdi:music');
  return `<ha-icon icon="${esc(mdi)}"></ha-icon>`;
};

const mmss = (s) => {
  const n = parseInt(s, 10);
  if (!n || n < 0) return '';
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
};

class MusicAssistantTouchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._mode = 'home';      // home | zoek | detail
    this._cat = 0;
    this._soort = 0;
    this._q = '';
    this._res = [];
    this._det = [];
    this._detTitel = '';
    this._detUri = '';
    this._terug = 'zoek';
    this._kbd = true;
    this._zone = 0;
    this._bezig = false;
    this._beeld = {};      // uri -> the cover Music Assistant has right now
    this._bron = {};       // source key -> { tijd, items }
    this._bezigBron = {};  // source key -> in-flight promise, so two draws fetch once
  }

  static getConfigElement() {
    return document.createElement('touch-music-card-editor');
  }

  // What you get when you add the card from the card picker. The aim is a card
  // that works the moment it lands, with nothing to fill in: nearly everyone has
  // exactly one Music Assistant, so the card looks it up and takes that one. The
  // speakers fill themselves already (every Music Assistant player, when no zones
  // are set), and one category that Music Assistant fills shows there is music
  // behind the card from the first second, instead of an empty "no categories".
  // The lookup needs admin rights, which whoever opens the card picker has.
  static async getStubConfig(hass) {
    const stub = {
      config_entry_id: '',
      height: 556,
      keyboard: true,
      limit: 24,
      categories: [{
        name: 'Recently played',
        source: { media_type: 'playlist', order_by: 'last_played_desc', limit: 12 },
      }],
    };
    try {
      const lijst = await hass.callWS({ type: 'config_entries/get', domain: 'music_assistant' });
      const actief = (lijst || []).filter((e) => e.state === 'loaded');
      if (actief.length === 1) stub.config_entry_id = actief[0].entry_id;
    } catch (e) { /* no rights or no Music Assistant: the editor dropdown takes over */ }
    return stub;
  }

  setConfig(config) {
    if (!config.config_entry_id) {
      throw new Error('Pick your Music Assistant in the card editor (config_entry_id).');
    }
    this._cfg = config;
    this._cats = config.categories || [];
    // keyboard: true  -> eigen schermtoetsenbord (Nest Hub, kiosk)
    // keyboard: false -> gewoon tekstveld met het toetsenbord van het apparaat
    this._schermtoetsen = config.keyboard !== false;
    this._kbd = this._schermtoetsen;
    this._zones = null;
  }

  // zones uit de config, of anders alle Music Assistant spelers automatisch
  _zoneLijst() {
    if (this._cfg.zones && this._cfg.zones.length) return this._cfg.zones;
    if (this._zones) return this._zones;
    const uit = [];
    const st = (this._hass && this._hass.states) || {};
    for (const id of Object.keys(st)) {
      if (!id.startsWith('media_player.')) continue;
      const a = st[id].attributes || {};
      if (!a.mass_player_type) continue;
      uit.push({
        name: a.friendly_name || id,
        entity: id,
        icon: a.mass_player_type === 'group' ? 'groep' : 'speaker',
      });
    }
    this._zones = uit.length ? uit : [{ name: 'Speler', entity: '', icon: 'speaker' }];
    return this._zones;
  }

  getCardSize() { return 12; }

  // ---------- the library ----------
  //
  // Two things need Music Assistant's library: a category that fills itself,
  // and the cover of a tile whose configuration does not pin one. Both are
  // answered by music_assistant.get_library, so both share one cache and one
  // rule: drawing never waits for it. The card paints what it knows, asks for
  // the rest in the background, and redraws once when it arrives.

  _bronSleutel(b) {
    return [b.media_type || 'playlist', b.order_by || '', b.favorite ? 1 : 0,
      b.search || '', b.limit || 24].join('|');
  }

  // Every library answer also feeds the cover index, so a hand-made tile that
  // happens to point at the same uri gets a fresh image for free.
  _onthoudBeeld(items) {
    for (const it of items || []) {
      const u = it.uri || it.media_content_id;
      if (u && it.image) this._beeld[u] = it.image;
    }
  }

  _bronHaal(b) {
    const s = this._bronSleutel(b);
    const c = this._bron[s];
    if (c && Date.now() - c.tijd < BIB_TTL) return Promise.resolve(c.items);
    if (this._bezigBron[s]) return this._bezigBron[s];
    const data = {
      config_entry_id: this._cfg.config_entry_id,
      media_type: b.media_type || 'playlist',
      limit: Math.min(b.limit || 24, BIB_MAX),
    };
    if (b.order_by) data.order_by = b.order_by;
    if (b.favorite) data.favorite = true;
    if (b.search) data.search = b.search;
    const p = this._ws({
      type: 'call_service',
      domain: 'music_assistant',
      service: 'get_library',
      service_data: data,
      return_response: true,
    }).then((r) => {
      const items = ((r && r.response) || {}).items || [];
      this._onthoudBeeld(items);
      this._bron[s] = { tijd: Date.now(), items };
      delete this._bezigBron[s];
      return items;
    }).catch((e) => {
      // A failed fetch is cached as empty for the same TTL. Without that, a
      // Music Assistant that is down turns every redraw into another attempt.
      this._bron[s] = { tijd: Date.now(), items: [] };
      delete this._bezigBron[s];
      this._fout(e);
      return [];
    });
    this._bezigBron[s] = p;
    return p;
  }

  // Work out what is still missing and fetch it, once, in parallel.
  _vulAan() {
    if (!this._hass || !this._cfg || !this._cfg.config_entry_id) return;
    const soorten = new Set();
    const taken = [];
    for (const cat of this._cats) {
      if (cat.source) { taken.push(this._bronHaal(cat.source)); continue; }
      for (const t of cat.tiles || []) {
        // A pinned image or a chosen icon needs nothing fetched.
        if (t.image || t.icon || this._beeld[t.uri]) continue;
        const soort = SOORT_VAN(t.uri);
        if (soort) soorten.add(soort);
      }
    }
    for (const soort of soorten) {
      taken.push(this._bronHaal({ media_type: soort, limit: BIB_MAX }));
    }
    if (!taken.length) return;
    Promise.all(taken).then(() => {
      if (this.isConnected && this._mode === 'home') this._tekenRechts();
    });
  }

  // A category is either a list you wrote or a source Music Assistant fills.
  // Both leave here in the same shape, so nothing downstream has to care.
  _tegelsVan(cat) {
    if (!cat) return [];
    if (!cat.source) return cat.tiles || [];
    const c = this._bron[this._bronSleutel(cat.source)];
    if (!c) return [];
    return c.items.map((it) => ({
      name: it.name,
      uri: it.uri,
      image: it.image,
      play: cat.source.play === true,
      radio_mode: cat.source.radio_mode === true,
    }));
  }

  // Configuration wins, then whatever Music Assistant has now, then the icon.
  // A chosen icon counts as configuration: several playlists carry Music
  // Assistant's own placeholder logo as their cover, and fetching that over a
  // deliberate icon makes the wall of tiles worse, not fresher.
  _tegelBeeld(t) {
    const eigen = VEILIG(t.image);
    if (eigen) return eigen;
    if (t.icon) return '';
    return VEILIG(this._beeld[t.uri]);
  }

  // Taal: config.language, anders die van Home Assistant, anders Engels.
  _taal() {
    const g = (this._cfg.language
      || (this._hass && this._hass.language) || 'en').slice(0, 2).toLowerCase();
    return TAAL[g] || TAAL.en;
  }

  set hass(hass) {
    const eerste = !this._hass;
    this._hass = hass;
    if (eerste || !this.shadowRoot.firstChild) this._bouw();
    this._pasThemaToe();
    this._syncSpeler();
  }

  // Measure the background the theme gives the card and switch the overlay colours
  // with it. A view can carry its own theme, so the global dark-mode flag is not
  // enough; what counts is what is really behind the card.
  _pasThemaToe() {
    // Measure the surface the card really paints, not a variable that may disagree with
    // it: a view theme can set --card-background-color dark while --ha-card-background,
    // which the surface uses, stays light.
    const vlak = this.shadowRoot && this.shadowRoot.querySelector('.wrap');
    const echt = vlak ? getComputedStyle(vlak).backgroundColor : '';
    const zichtbaar = echt && !/^rgba\([^)]*,\s*0\)$/.test(echt) && echt !== 'transparent';
    const cs = getComputedStyle(this);
    const kleur = (zichtbaar ? echt : '')
      || cs.getPropertyValue('--ha-card-background')
      || cs.getPropertyValue('--card-background-color')
      || cs.getPropertyValue('--primary-background-color') || '';
    if (kleur === this._themaKleur) return;
    this._themaKleur = kleur;
    let r, g, b;
    const hex = kleur.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else {
      const m = kleur.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (!m) return;
      r = +m[1]; g = +m[2]; b = +m[3];
    }
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    this.classList.toggle('licht', lum > 0.5);
  }

  // ---------- helpers ----------
  _zoneCfg() { const z = this._zoneLijst(); return z[Math.min(this._zone, z.length - 1)]; }
  _speler() { return this._zoneCfg().entity; }
  _volEntity() { return this._zoneCfg().volume || this._zoneCfg().entity; }
  _st(e) { return (this._hass && this._hass.states[e]) || null; }

  // De speler die de muziek echt vasthoudt. Staat de gekozen zone zelf te spelen,
  // dan is dat hem. Speelt een groep waar deze speler in zit (of die dezelfde
  // wachtrij heeft), dan moeten play/pauze/volgende naar die groep - anders
  // komt het commando bij een lege wachtrij terecht en gebeurt er niets.
  _actief() {
    if (this._actEnt && this._actHass === this._hass && this._actZone === this._zone) return this._actEnt;
    const eigen = this._speler();
    const s = this._st(eigen);
    let uit = eigen;
    if (!(s && SPEELT.includes(s.state))) {
      const q = s && s.attributes ? s.attributes.active_queue : null;
      const st = (this._hass && this._hass.states) || {};
      let viaGroep = null;
      for (const id of Object.keys(st)) {
        if (id === eigen || !id.startsWith('media_player.')) continue;
        const a = st[id].attributes || {};
        if (!a.mass_player_type || !SPEELT.includes(st[id].state)) continue;
        if (q && a.active_queue === q) { viaGroep = id; break; }
        if (!viaGroep && (a.group_members || []).indexOf(eigen) !== -1) viaGroep = id;
      }
      uit = viaGroep || eigen;
    }
    this._actHass = this._hass;
    this._actZone = this._zone;
    this._actEnt = uit;
    return uit;
  }

  // Schuifregelaar loopt tot volume_max procent in plaats van tot 100.
  // Zo is 0-20% het hele bereik in plaats van het eerste vijfde deel.
  _volMax() {
    const z = this._zoneCfg();
    const v = z.volume_max != null ? z.volume_max : this._cfg.volume_max;
    const n = parseFloat(v);
    return (n > 0 && n <= 100) ? n : 100;
  }

  // Volume waarop de muziek altijd start. Leeg = niets aanraken.
  _volStart() {
    const z = this._zoneCfg();
    const v = z.volume_start != null ? z.volume_start : this._cfg.volume_start;
    const n = parseFloat(v);
    return (n >= 0 && n <= 100) ? n : null;
  }

  // volume_start is geen vaste startwaarde maar een terugvalwaarde: staat het
  // volume binnen het maximum, dan blijft het gewoon staan. Alleen als het
  // erboven staat (tv op de soundbar) gaat het bij het starten omlaag.
  async _startVolume() {
    const p = this._volStart();
    if (p == null) return;
    const vs = this._st(this._volEntity());
    const nu = (vs && vs.attributes.volume_level != null)
      ? vs.attributes.volume_level * 100 : null;
    if (nu == null || nu <= this._volMax()) return;
    await this._call('media_player', 'volume_set',
      { volume_level: p / 100 }, { entity_id: this._volEntity() }).catch(() => {});
  }

  _volStap(richting) {
    const stap = Math.max(0.01, this._volMax() / 100 / 20);
    const vs = this._st(this._volEntity());
    const nu = (vs && vs.attributes.volume_level) || 0;
    const doel = Math.max(0, Math.min(1, nu + richting * stap));
    this._call('media_player', 'volume_set',
      { volume_level: doel }, { entity_id: this._volEntity() });
  }

  async _ws(msg) { return this._hass.connection.sendMessagePromise(msg); }

  async _call(domain, service, data, target) {
    return this._hass.callService(domain, service, data, target);
  }

  // Bedieningsknop: even dimmen zolang het loopt, en een fout laten zien
  // in plaats van stilletjes niets doen.
  _bedien(service, data, el, naVullen, herkans) {
    const ent = this._actief();
    if (!ent) return false;
    // Een speaker doet er soms een seconde over. Korte blokkade tegen
    // dubbeltikken, zodat een tweede tik de eerste niet weer ongedaan maakt.
    const nu = Date.now();
    if (nu < (this._slotTot || 0)) return false;
    this._slotTot = nu + 800;
    if (el) {
      el.classList.add('bezig');
      setTimeout(() => el.classList.remove('bezig'), 350);
    }
    const stuur = () => this._call('media_player', service, data || {}, { entity_id: ent })
      .catch((e) => this._fout(e));
    // De JBL's hangen via de cast-integratie aan Music Assistant en slikken
    // het spring-commando niet altijd. Speelt na 2,5 seconde nog hetzelfde
    // nummer, dan een keer opnieuw sturen.
    const merk = () => {
      const x = (this._st(ent) || {}).attributes || {};
      return String(x.media_content_id) + '|' + String(x.media_position_updated_at);
    };
    const opnieuw = herkans && this._cfg.retry_next !== false;
    const doe = !opnieuw ? stuur : () => stuur().then(() => {
      const voor = merk();
      setTimeout(() => { if (merk() === voor) stuur(); }, 2500);
    });
    // Vorige/volgende: als de rest van de lijst nog in de wachtrij gezet wordt,
    // eerst dat afwachten - anders is er nog geen volgend nummer om heen te gaan.
    if (naVullen && this._vul) {
      if (el) el.classList.add('bezig');
      this._vul.then(doe, doe).then(() => { if (el) el.classList.remove('bezig'); });
    } else doe();
    return true;
  }

  // `behalve` is de speler waar de muziek vandaan komt: die mag je niet
  // uitzetten, anders is er niets meer om over te zetten. Hetzelfde geldt voor
  // een groep die diezelfde wachtrij vasthoudt: Music Assistant leegt bij het
  // uitzetten van een groep de wachtrij van de leden, en dan vindt
  // transfer_queue een lege bron ("The queue is empty"). Staat er een lijst in
  // `uitstel`, dan wordt zo'n uitzetten daarin geparkeerd tot na de overdracht.
  async _voorbereiden(behalve, uitstel) {
    const b = this._zoneCfg().before;
    if (!b) return;
    let gedaan = false;
    if (b.turn_off && b.turn_off !== behalve) {
      const st = this._st(b.turn_off);
      if (st && ['playing', 'paused', 'on', 'idle', 'buffering'].includes(st.state)) {
        const bron = behalve ? this._st(behalve) : null;
        const q = bron && bron.attributes ? bron.attributes.active_queue : null;
        const zelfdeRij = !!q && st.attributes.active_queue === q;
        if (uitstel && zelfdeRij) {
          uitstel.push(b.turn_off);
        } else {
          await this._call('media_player', 'turn_off', {}, { entity_id: b.turn_off }).catch(() => {});
          gedaan = true;
        }
      }
    }
    if (b.unjoin) {
      const st = this._st(b.unjoin);
      const gm = (st && st.attributes.group_members) || [];
      if (gm.length > 1) {
        await this._call('media_player', 'unjoin', {}, { entity_id: b.unjoin }).catch(() => {});
        gedaan = true;
      }
    }
    if (b.join) {
      const l = this._st(b.join.leader);
      const gm = (l && l.attributes.group_members) || [];
      const mist = (b.join.members || []).some((m) => gm.indexOf(m) === -1);
      if (mist) {
        await this._call('media_player', 'join',
          { group_members: b.join.members }, { entity_id: b.join.leader }).catch(() => {});
        gedaan = true;
      }
    }
    if (gedaan) await new Promise((r) => setTimeout(r, 350));
  }

  // Van speler wisselen. Speelt er iets? Dan verhuist de wachtrij mee.
  // Zet transfer_on_switch: false in de config om alleen van beeld te wisselen.
  async _wisselZone(i, el) {
    const oudEnt = this._actief();
    const st = this._st(oudEnt);
    const speelde = st && SPEELT.includes(st.state);
    // Onthouden wat er speelt vóór er iets geschakeld wordt. Raakt de wachtrij
    // onderweg toch kwijt, dan kan de kaart dit nummer op de nieuwe speler
    // opnieuw starten in plaats van stil te vallen.
    const bron = speelde && st.attributes
      ? { media: st.attributes.media_content_id || '', queue: st.attributes.active_queue || null }
      : null;
    this._zone = i;
    this._opt = null;
    this._syncSpeler();
    const nieuw = this._zoneCfg();
    if (el) el.classList.add('bezig');
    try {
      // Zelfde speler, andere samenstelling (bv. Sonos keuken alleen tegenover
      // keuken + serre): niets verhuizen, alleen koppelen of loskoppelen.
      if (nieuw.entity === oudEnt) { await this._voorbereiden(); return; }

      // Groep uitzetten of juist koppelen zoals deze zone het wil - maar nooit
      // de speler waar de muziek nu vandaan komt, en niet een groep die
      // dezelfde wachtrij vasthoudt: die gaat pas na de overdracht uit.
      const doorgeven = speelde && this._cfg.transfer_on_switch !== false;
      const later = [];
      await this._voorbereiden(oudEnt, doorgeven ? later : null);

      if (!doorgeven) return;

      // Een uitgezette speler of groep neemt de wachtrij niet aan.
      const ns = this._st(nieuw.entity);
      if (!ns || ['off', 'unavailable', 'standby'].includes(ns.state)) {
        await this._call('media_player', 'turn_on', {}, { entity_id: nieuw.entity })
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 700));
      }
      this._opt = { state: 'playing', tot: Date.now() + 12000 };
      let over = true;
      try {
        await this._call('music_assistant', 'transfer_queue',
          { source_player: oudEnt, auto_play: true }, { entity_id: nieuw.entity });
      } catch (e) { over = false; }

      // Weigert Music Assistant de overdracht (lege wachtrij), dan begint de
      // kaart het onthouden nummer gewoon opnieuw op de nieuwe speler.
      if (!over && bron && bron.media) {
        await this._call('music_assistant', 'play_media',
          { media_id: bron.media, enqueue: 'replace' }, { entity_id: nieuw.entity })
          .catch((e) => this._fout(e));
      }

      // Pas nu de oude groep uitzetten, en alleen als die nog staat te spelen.
      for (const ent of later) {
        const gs = this._st(ent);
        if (gs && SPEELT.includes(gs.state)) {
          await this._call('media_player', 'turn_off', {}, { entity_id: ent }).catch(() => {});
        }
      }
    } catch (e) {
      this._opt = null;
      this._fout(e);
    }
    if (el) el.classList.remove('bezig');
  }

  async _speel(uri, radio, el) {
    if (!uri) return;
    if (el) el.classList.add('bezig');
    this._opt = { state: 'playing', tot: Date.now() + 8000 };
    try {
      await this._voorbereiden();
      await this._startVolume();
      await this._call('music_assistant', 'play_media',
        { media_id: uri, enqueue: 'replace', radio_mode: !!radio },
        { entity_id: this._speler() });
    } catch (e) {
      this._fout(e);
    }
    if (el) el.classList.remove('bezig');
  }

  // Een nummer uit een lijst starten. We zetten de hele lijst in de wachtrij,
  // te beginnen bij het aangetikte nummer (de nummers ervoor komen erachter).
  // Anders staat er maar een nummer in de wachtrij en doet 'volgende' niets.
  async _speelLijst(uris, start, el) {
    const schoon = (uris || []).filter(Boolean);
    if (!schoon.length) return;
    const i = Math.max(0, Math.min(start || 0, schoon.length - 1));
    const rij = schoon.slice(i).concat(schoon.slice(0, i)).slice(0, 150);
    const speler = this._speler();
    if (el) el.classList.add('bezig');
    this._opt = { state: 'playing', tot: Date.now() + 8000 };
    try {
      await this._voorbereiden();
      await this._startVolume();
      // Eerst alleen het aangetikte nummer starten - dat gaat meteen.
      // Music Assistant zoekt elk nummer apart op, dus de rest van de lijst
      // schuiven we er daarna achteraan zonder erop te wachten.
      await this._call('music_assistant', 'play_media',
        { media_id: rij[0], enqueue: 'replace' }, { entity_id: speler });
      if (el) el.classList.remove('bezig');
      if (rij.length > 1) {
        // Eerst een handjevol, zodat 'volgende' meteen iets heeft; daarna de rest.
        const bij = (v) => this._call('music_assistant', 'play_media',
          { media_id: v, enqueue: 'add' }, { entity_id: speler });
        this._vul = bij(rij.slice(1, 6))
          .then(() => (rij.length > 6 ? bij(rij.slice(6)) : null))
          .catch((e) => this._fout(e))
          .then(() => { this._vul = null; });
      } else this._vul = null;
      return;
    } catch (e) {
      this._fout(e);
    }
    if (el) el.classList.remove('bezig');
  }

  _fout(e) {
    const el = this.shadowRoot.getElementById('melding');
    if (!el) return;
    el.textContent = (e && e.message ? e.message : String(e));
    clearTimeout(this._foutTimer);
    this._foutTimer = setTimeout(() => { el.textContent = ''; }, 6000);
  }

  async _zoek() {
    const q = this._q.trim();
    if (!q) return;
    this._bezig = true;
    this._mode = 'zoek';
    if (this._schermtoetsen) this._kbd = false;
    this._tekenRechts();
    const soort = SOORTEN[this._soort];
    try {
      const r = await this._ws({
        type: 'call_service',
        domain: 'music_assistant',
        service: 'search',
        service_data: {
          config_entry_id: this._cfg.config_entry_id,
          name: q,
          media_type: [soort.key],
          limit: this._cfg.limit || 24,
        },
        return_response: true,
      });
      const lijst = ((r && r.response) || {})[soort.veld] || [];
      this._onthoudBeeld(lijst);
      const ql = q.toLowerCase();
      const a = [], b = [];
      for (const it of lijst) {
        const art = ((it.artists && it.artists[0] && it.artists[0].name) || it.name || '').toLowerCase();
        (art.includes(ql) ? a : b).push(it);
      }
      this._res = a.concat(b);
    } catch (e) {
      this._res = [];
      this._fout(e);
    }
    this._bezig = false;
    this._tekenRechts();
  }

  async _open(it, el, terug) {
    const uri = it.uri || it.media_content_id;
    if (!uri) return;
    const soort = (uri.split('://')[1] || '').split('/')[0];
    if (soort === 'track' || soort === 'radio') { this._speel(uri, false, el); return; }
    this._bezig = true;
    this._terug = terug || 'zoek';
    this._detTitel = it.name || it.title || '';
    this._detUri = uri;
    this._mode = 'detail';
    this._det = [];
    this._tekenRechts();
    try {
      const r = await this._hass.callWS({
        type: 'media_player/browse_media',
        entity_id: this._speler(),
        media_content_id: uri,
        media_content_type: soort,
      });
      this._det = (r && r.children) || [];
    } catch (e) {
      this._fout(e);
    }
    this._bezig = false;
    this._tekenRechts();
  }

  _toets(t) {
    if (t === 'BS') this._q = this._q.slice(0, -1);
    else if (t === 'CLR') this._q = '';
    else if (t === 'SP') this._q += ' ';
    else this._q += t;
    const q = this.shadowRoot.getElementById('qtekst');
    if (q) q.innerHTML = this._q ? esc(this._q) : `<i>${esc(this._taal().zoeken)}</i>`;
  }

  // ---------- opbouw ----------
  _bouw() {
    // fill: true -> de kaart meet zelf hoeveel scherm er onder hem over is en
    // vult dat. Werkt in elk soort weergave (sections, panel, masonry).
    const vul = this._cfg.fill === true;
    const h = (this._cfg.height || 556) + 'px';
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="wrap" style="--mc-h:${h};--zn:${this._zoneLijst().length}">
        <div class="col left">
          <div class="zones" id="zones"></div>
          <div class="np" id="np"></div>
          <div class="volrow">
            <button class="vk" data-act="vol-">${svg('min')}</button>
            <button class="slider" id="slider" data-act="volset">
              <div class="baan"></div><div class="fill" id="volfill"></div>
              <div class="knop" id="volknop"></div>
            </button>
            <button class="vk" data-act="vol+">${svg('plus')}</button>
            <div class="vollbl" id="vollbl"></div>
          </div>
          <div id="melding"></div>
          <div class="links" id="links"></div>
        </div>
        <div class="scheiding"></div>
        <div class="col right" id="right"></div>
      </div>`;
    this._tekenZones();
    this._tekenLinks();
    this._tekenRechts();
    clearInterval(this._tikTimer);
    this._tikTimer = setInterval(() => {
      this._toonVoortgang(); this._vulHoogte(); this._pasTegels(); this._toonRail();
    }, 1000);
    if (vul) {
      requestAnimationFrame(() => this._vulHoogte());
      if (!this._maatLuister) {
        this._maatLuister = () => this._vulHoogte();
        window.addEventListener('resize', this._maatLuister);
      }
    }
    this.shadowRoot.addEventListener('click', (ev) => this._klik(ev));
    this.shadowRoot.addEventListener('pointerdown', (ev) => {
      const t = ev.composedPath().find((n) => n.dataset && n.dataset.act);
      if (t && (t.dataset.act === 'op' || t.dataset.act === 'neer')) {
        this._scrollVast(t.dataset.act === 'op' ? -1 : 1);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) =>
      this.shadowRoot.addEventListener(e, () => { this._scrollLos(); this._sleepLos(); }));
    // scrollbalk met de vinger verslepen
    this.shadowRoot.addEventListener('pointerdown', (ev) => {
      const rail = ev.composedPath().find((n) => n.classList && n.classList.contains('rail'));
      if (!rail) return;
      ev.preventDefault();
      this._sleep = rail;
      rail.classList.add('sleep');
      try { rail.setPointerCapture(ev.pointerId); } catch (e) { /* niet erg */ }
      this._sleepNaar(ev);
    });
    this.shadowRoot.addEventListener('pointermove', (ev) => {
      if (this._sleep) { ev.preventDefault(); this._sleepNaar(ev); }
    });
    this.shadowRoot.addEventListener('scroll', () => this._toonRail(), true);
    this.shadowRoot.addEventListener('input', (ev) => {
      if (ev.target && ev.target.id === 'qveld') this._q = ev.target.value;
    });
    this.shadowRoot.addEventListener('keydown', (ev) => {
      if (ev.target && ev.target.id === 'qveld' && ev.key === 'Enter') {
        this._q = ev.target.value;
        this._zoek();
      }
    });
    // The card is on screen now; everything it still needs can arrive late.
    this._vulAan();
  }

  _tekenZones() {
    const el = this.shadowRoot.getElementById('zones');
    el.innerHTML = this._zoneLijst().map((z, i) =>
      `<button data-act="zone" data-i="${i}" title="${esc(z.name || '')}">${svg(z.icon || 'speaker')}</button>`).join('');
  }

  // Navigatieknoppen naar andere dashboardweergaven, zodat de view uit
  // precies een kaart kan bestaan: links: [{ name, icon, path }]
  _tekenLinks() {
    const el = this.shadowRoot.getElementById('links');
    if (!el) return;
    el.innerHTML = (this._cfg.links || []).map((l, i) =>
      `<button data-act="link" data-i="${i}">${l.icon ? svg(l.icon) : ''}${esc(l.name || '')}</button>`).join('');
  }

  _ganaar(pad) {
    if (!pad) return;
    history.pushState(null, '', pad);
    window.dispatchEvent(new Event('location-changed'));
  }

  _klik(ev) {
    const t = ev.composedPath().find((n) => n.dataset && n.dataset.act);
    if (!t) return;
    const a = t.dataset.act;
    const i = t.dataset.i !== undefined ? parseInt(t.dataset.i, 10) : null;
    if (a === 'zone') this._wisselZone(i, t);
    else if (a === 'link') this._ganaar(((this._cfg.links || [])[i] || {}).path);
    else if (a === 'vol+') this._volStap(1);
    else if (a === 'vol-') this._volStap(-1);
    else if (a === 'volset') {
      const r = t.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      this._call('media_player', 'volume_set',
        { volume_level: Math.min(1, f * this._volMax() / 100) },
        { entity_id: this._volEntity() });
    }
    else if (a === 'shuffle') {
      const s = this._st(this._actief());
      this._bedien('shuffle_set', { shuffle: !(s && s.attributes.shuffle) }, t);
    }
    else if (a === 'repeat') {
      const s = this._st(this._actief());
      const nu = (s && s.attributes.repeat) || 'off';
      this._bedien('repeat_set', { repeat: nu === 'off' ? 'all' : (nu === 'all' ? 'one' : 'off') }, t);
    }
    else if (a === 'naarzoek') { this._mode = 'zoek'; this._kbd = this._schermtoetsen; this._tekenRechts(); }
    else if (a === 'home') { this._mode = 'home'; this._tekenRechts(); }
    else if (a === 'cat') { this._cat = i; this._mode = 'home'; this._tekenRechts(); }
    else if (a === 'soort') { this._soort = i; if (this._q.trim()) this._zoek(); else this._tekenRechts(); }
    else if (a === 'kbd') { this._kbd = !this._kbd; this._tekenRechts(); }
    else if (a === 'toets') this._toets(t.dataset.t);
    else if (a === 'zoeknu') this._zoek();
    else if (a === 'op') this._scroll(-1);
    else if (a === 'neer') this._scroll(1);
    else if (a === 'tegel') {
      const tl = this._tegelsVan(this._cats[this._cat])[i];
      if (!tl) return;
      const direct = tl.play === true || this._cfg.tile_action === 'play';
      if (direct) this._speel(tl.uri, tl.radio_mode, t);
      else this._open({ name: tl.name, uri: tl.uri }, t, 'home');
    }
    else if (a === 'res') {
      const it = this._res[i];
      if (!it) return;
      const uri = it.uri || it.media_content_id || '';
      // Losse nummers: hele resultatenlijst in de wachtrij zodat 'volgende' werkt.
      if (uri.indexOf('://track/') !== -1) {
        this._speelLijst(this._res.map((x) => x.uri || x.media_content_id), i, t);
      } else this._open(it, t, 'zoek');
    }
    else if (a === 'det') {
      if (!this._det[i]) return;
      this._speelLijst(this._det.map((d) => d.media_content_id), i, t);
    }
    else if (a === 'alles') this._speel(this._detUri, false, t);
    else if (a === 'terug') { this._mode = this._terug || 'zoek'; this._tekenRechts(); }
    else if (a === 'pp') {
      const speelt = this._toonState === 'playing';
      if (this._bedien(speelt ? 'media_pause' : 'media_play', {}, t)) {
        // Meteen het andere icoon tonen; de echte status volgt zo vanzelf.
        this._opt = { state: speelt ? 'paused' : 'playing', tot: Date.now() + 8000 };
        this._syncSpeler();
      }
    }
    else if (a === 'prev') this._bedien('media_previous_track', {}, t, true);
    else if (a === 'next') this._bedien('media_next_track', {}, t, true, true);
  }

  // Scrollbaar vak. Op een gecaste Nest Hub werkt aanraakscrollen niet,
  // dus staan er standaard pijlknoppen naast. Zet arrows: false voor pc/telefoon.
  _scrollbox(inhoud) {
    if (this._cfg.arrows === false) return `<div class="scrollbox">${inhoud}</div>`;
    return `<div class="scrollbox pijl">${inhoud}
      <div class="pijlen">
        <button data-act="op">${svg('mdi:chevron-up')}</button>
        <div class="rail"><div class="duim"></div></div>
        <button data-act="neer">${svg('mdi:chevron-down')}</button>
      </div></div>`;
  }

  // fill: true -> hoogte = wat er onder de bovenkant van de kaart nog aan
  // scherm over is. Zo staat de kaart overal precies onder de badges/chips
  // zonder dat je per weergave een hoogte hoeft uit te rekenen.
  _vulHoogte() {
    if (this._cfg.fill !== true) return;
    const wrap = this.shadowRoot && this.shadowRoot.querySelector('.wrap');
    if (!wrap || !this.isConnected) return;
    const boven = this.getBoundingClientRect().top;
    const marge = this._cfg.fill_margin == null ? 8 : this._cfg.fill_margin;
    const h = Math.max(300, Math.round(window.innerHeight - boven - marge));
    if (h === this._vulH) return;
    this._vulH = h;
    wrap.style.setProperty('--mc-h', h + 'px');
  }

  // Passen er drie rijen tegels nog net niet? Dan de tegels een paar pixels
  // kleiner maken in plaats van de gebruiker een halve regel te laten scrollen.
  _pasTegels() {
    const vak = this.shadowRoot && this.shadowRoot.querySelector('.tiles.vlak');
    if (!vak || !vak.clientHeight) return;
    const sleutel = vak.children.length + 'x' + vak.clientHeight + 'x' + Math.round(vak.clientWidth);
    if (sleutel === this._tegelSleutel) return;
    this._tegelSleutel = sleutel;
    vak.style.removeProperty('--tw');
    if (vak.scrollHeight <= vak.clientHeight + 1) return;
    const kolommen = (getComputedStyle(vak).gridTemplateColumns || '').split(' ')
      .filter(Boolean).length || 4;
    if (Math.ceil(vak.children.length / kolommen) > 3) return;
    let tw = 108;
    while (tw > 78 && vak.scrollHeight > vak.clientHeight + 1) {
      tw -= 4;
      vak.style.setProperty('--tw', tw + 'px');
    }
  }

  // Vinger op de scrollbalk: de duim volgt en de lijst schuift mee.
  _sleepNaar(ev) {
    const rail = this._sleep;
    const vak = this.shadowRoot && this.shadowRoot.querySelector('.scrollbox .vlak');
    if (!rail || !vak) return;
    const duim = rail.firstElementChild;
    const r = rail.getBoundingClientRect();
    const dh = (duim && duim.offsetHeight) || 0;
    const ruimte = Math.max(1, r.height - dh);
    const f = Math.max(0, Math.min(1, (ev.clientY - r.top - dh / 2) / ruimte));
    vak.scrollTop = f * Math.max(0, vak.scrollHeight - vak.clientHeight);
    this._toonRail();
  }

  _sleepLos() {
    if (!this._sleep) return;
    this._sleep.classList.remove('sleep');
    this._sleep = null;
  }

  // Positie-indicator tussen de pijlknoppen bijwerken.
  _toonRail() {
    const sr = this.shadowRoot;
    if (!sr) return;
    const rail = sr.querySelector('.scrollbox.pijl .rail');
    const vak = sr.querySelector('.scrollbox .vlak');
    if (!rail || !vak) return;
    const duim = rail.firstElementChild;
    const hoog = vak.scrollHeight;
    const zicht = vak.clientHeight;
    if (!zicht || hoog <= zicht + 2) { rail.classList.remove('aan'); return; }
    rail.classList.add('aan');
    const deel = Math.max(0.12, zicht / hoog);
    const pos = vak.scrollTop / (hoog - zicht);
    duim.style.height = (deel * 100) + '%';
    duim.style.top = (Math.max(0, Math.min(1, pos)) * (1 - deel) * 100) + '%';
  }

  _scroll(richting) {
    const vak = this.shadowRoot.querySelector('.scrollbox .vlak');
    if (!vak) return;
    // Bijna een volle bladzijde per tik, met een streepje overlap.
    const stap = Math.max(160, Math.round(vak.clientHeight * 0.9));
    if (vak.scrollBy) vak.scrollBy({ top: richting * stap, behavior: 'smooth' });
    else vak.scrollTop += richting * stap;
  }

  // Ingedrukt houden blijft doorscrollen.
  _scrollVast(richting) {
    clearInterval(this._scrollTimer);
    this._scrollTimer = setInterval(() => this._scroll(richting), 320);
  }

  _scrollLos() { clearInterval(this._scrollTimer); }

  // ---------- rechterkolom ----------
  _tekenRechts() {
    const el = this.shadowRoot.getElementById('right');
    if (!el) return;
    if (this._mode === 'home') el.innerHTML = this._homeHtml();
    else if (this._mode === 'detail') el.innerHTML = this._detailHtml();
    else el.innerHTML = this._zoekHtml();
    this._tegelSleutel = null;
    requestAnimationFrame(() => { this._pasTegels(); this._toonRail(); });
  }

  _homeHtml() {
    const cats = this._cats;
    if (!cats.length) return `<div class="leeg">${this._taal().geenCats}</div>`;
    const chips = this._tabsHtml(false);
    const cat = cats[this._cat] || {};
    const lijst = this._tegelsVan(cat);
    // A source category has nothing to show until its fetch lands. Say so
    // rather than drawing an empty grid that looks like a broken category.
    if (cat.source && !lijst.length) {
      return chips + `<div class="leeg">${this._taal().bezigOphalen}</div>`;
    }
    const tiles = lijst.map((t, i) => {
      const b = this._tegelBeeld(t);
      const beeld = b
        ? `<img loading="lazy" src="${esc(GROOT(b))}">`
        : `<div class="ic">${svg(t.icon || (SOORT_VAN(t.uri) === 'radio' ? 'radio' : 'muziek'))}</div>`;
      return `<button class="tile" data-act="tegel" data-i="${i}">${beeld}<span>${esc(t.name)}</span></button>`;
    }).join('');
    return chips + this._scrollbox(`<div class="tiles vlak">${tiles}</div>`);
  }

  // De categorietabs, met de zoekknop als laatste tab rechts.
  _tabsHtml(zoekt) {
    const tabs = this._cats.map((c, i) =>
      `<button class="${!zoekt && i === this._cat ? 'on' : ''}" data-act="cat" data-i="${i}">${esc(c.name)}</button>`).join('');
    return `<div class="chips">${tabs}
      <button class="zoektab${zoekt ? ' on' : ''}" data-act="naarzoek"
              title="${esc(this._taal().zoek)}">${svg('zoek')}</button></div>`;
  }

  _zoekHtml() {
    const t = this._taal();
    const soorten = (this._cfg.search_types || SOORTEN.map((s) => s.key));
    const chips = SOORTEN.map((s, i) => soorten.includes(s.key)
      ? `<button class="${i === this._soort ? 'on' : ''}" data-act="soort" data-i="${i}">${esc(t.soort[s.key])}</button>`
      : '').join('');
    const qbar = this._schermtoetsen
      ? `<div class="qbar">${svg('zoek')}
          <div class="q" id="qtekst">${this._q ? esc(this._q) : `<i>${esc(t.zoeken)}</i>`}</div>
          <button class="kb" data-act="kbd">${this._kbd ? t.verberg : t.toetsen}</button></div>`
      : `<div class="qbar">${svg('zoek')}
          <input class="q" id="qveld" type="search" autocomplete="off"
                 placeholder="${esc(t.zoeken)}" value="${esc(this._q)}">
          <button class="kb" data-act="zoeknu">${t.zoek}</button></div>`;
    const body = (this._schermtoetsen && this._kbd) ? this._kbdHtml() : this._resHtml();
    return this._tabsHtml(true) + qbar
      + `<div class="chips" style="margin-top:6px">${chips}</div>` + body;
  }

  _kbdHtml() {
    const kn = (t, l, cls) => `<button class="${cls || ''}" data-act="toets" data-t="${t}">${l}</button>`;
    const num = `<div class="kr num">${[...'1234567890'].map((c) => kn(c, c)).join('')}</div>`;
    const rijen = RIJEN.map((r, idx) => {
      let html = [...r].map((c) => kn(c, c.toUpperCase())).join('');
      if (idx === 2) html += kn('BS', '&#9003;');
      return `<div class="kr">${html}</div>`;
    }).join('');
    const t = this._taal();
    const onder = `<div class="kr wide">${kn('CLR', t.wissen)}${kn('SP', t.spatie)}
      <button class="go" data-act="zoeknu">${t.zoek}</button></div>`;
    return `<div class="kbd">${num}${rijen}${onder}</div>`;
  }

  _resHtml() {
    const t = this._taal();
    if (this._bezig) return `<div class="leeg">${t.bezigZoeken}</div>`;
    if (!this._res.length) return `<div class="leeg">${t.geenResultaat}</div>`;
    const soort = SOORTEN[this._soort];
    if (soort.lijst) {
      const rijen = this._res.map((it, i) => {
        const art = (it.artists && it.artists[0] && it.artists[0].name) || '';
        const bron = VEILIG(it.image);
        const img = bron ? `<img loading="lazy" src="${esc(KLEIN(bron))}">` : '<span></span>';
        return `<button class="rij" data-act="res" data-i="${i}">${img}
          <div class="tx"><b>${esc(it.name)}</b>${art ? ' <span>&middot; ' + esc(art) + '</span>' : ''}</div>
          <span class="du">${mmss(it.duration)}</span></button>`;
      }).join('');
      return this._scrollbox(`<div class="lijst vlak">${rijen}</div>`);
    }
    const tiles = this._res.map((it, i) => {
      const art = (it.artists && it.artists[0] && it.artists[0].name) || '';
      const bi = VEILIG(it.image);
      const beeld = bi ? `<img loading="lazy" src="${esc(GROOT(bi))}">` : '<div class="ph"></div>';
      return `<button class="tile" data-act="res" data-i="${i}">${beeld}
        <span>${esc(it.name)}${art ? ' &middot; ' + esc(art) : ''}</span></button>`;
    }).join('');
    return this._scrollbox(`<div class="tiles vlak">${tiles}</div>`);
  }

  _detailHtml() {
    const t = this._taal();
    const n = this._det.length;
    let tijd = 0;
    for (const d of this._det) tijd += parseInt(d.media_duration || 0, 10) || 0;
    const min = Math.round(tijd / 60);
    const extra = min > 0 ? (min >= 60
      ? ` · ${Math.floor(min / 60)} ${t.uur} ${min % 60} ${t.minuut}`
      : ` · ${min} ${t.minuut}`) : '';
    const telling = (this._bezig || !n) ? ''
      : `<span class="aantal">${n} ${n === 1 ? t.nummer : t.nummers}${extra}</span>`;
    const kop = `<div class="kop">
      <button class="terug" data-act="terug">${svg('terug')} ${this._terug === 'home' ? t.terug : t.resultaten}</button>
      <div class="titel">${esc(this._detTitel)}${telling}</div>
      <button class="alles" data-act="alles">${t.speelAlles}</button></div>`;
    if (this._bezig) return kop + `<div class="leeg">${t.bezigOphalen}</div>`;
    if (!n) return kop + `<div class="leeg">${t.geenNummers}</div>`;
    const rijen = this._det.map((d, i) => {
      const img = d.thumbnail ? `<img loading="lazy" src="${esc(KLEIN(d.thumbnail))}">` : '<span></span>';
      return `<button class="rij" data-act="det" data-i="${i}">${img}
        <div class="tx"><b>${esc(d.title)}</b></div>
        <span class="du">${mmss(d.media_duration)}</span></button>`;
    }).join('');
    return kop + this._scrollbox(`<div class="lijst vlak">${rijen}</div>`);
  }

  // ---------- live speler ----------
  _syncSpeler() {
    const sr = this.shadowRoot;
    if (!sr || !sr.getElementById('np')) return;
    const ent = this._actief();
    const eigen = this._speler();
    const zones = this._zoneLijst();
    const zs = sr.querySelectorAll('#zones button');
    zs.forEach((b, i) => {
      b.classList.toggle('on', i === this._zone);
      const z = zones[i];
      const zst = z && this._st(z.entity);
      b.classList.toggle('speelt', !!(zst && SPEELT.includes(zst.state)));
    });

    const vs = this._st(this._volEntity());
    const vol = vs && vs.attributes.volume_level != null ? vs.attributes.volume_level : 0;
    const fill = sr.getElementById('volfill');
    const lbl = sr.getElementById('vollbl');
    const knop = sr.getElementById('volknop');
    const pct = Math.round(vol * 100);
    const stand = Math.max(0, Math.min(100, pct / this._volMax() * 100));
    if (fill) fill.style.width = stand + '%';
    if (knop) knop.style.left = stand + '%';
    if (lbl) lbl.textContent = pct + '%';

    const s = this._st(ent);
    const np = sr.getElementById('np');
    const a = (s && s.attributes) || {};
    const pic = a.entity_picture_local || a.entity_picture || '';
    const t = this._taal();
    const titel = a.media_title || (s ? t.stil : t.geenSpeler);
    const artiest = [a.media_artist, a.media_album_name].filter(Boolean).join(' · ');

    // Na een druk op play/pauze tonen we alvast de nieuwe stand, tot de speler
    // het echt bevestigt (of de tijd om is).
    let toon = s ? s.state : '';
    if (this._opt) {
      if (Date.now() > this._opt.tot || toon === this._opt.state) this._opt = null;
      else toon = this._opt.state;
    }
    this._toonState = toon;
    const speelt = toon === 'playing';

    // Alleen hertekenen als er iets veranderd is - anders bouwt de kaart het
    // hoesje bij elke statuswijziging in huis opnieuw op en wordt hij traag.
    const sig = [ent, eigen, toon, titel, artiest, a.media_content_id,
      pic.split('&cache=')[0], a.shuffle, a.repeat, a.media_duration].join('|');
    if (sig === this._npSig) { this._toonVoortgang(); return; }
    this._npSig = sig;
    // Speelt het ergens anders dan op de gekozen zone? Laat zien waar.
    const elders = (ent && ent !== eigen && s && SPEELT.includes(s.state))
      ? `<div class="op">${t.speeltOp} ${esc(a.friendly_name || ent)}</div>` : '';
    const duur = parseInt(a.media_duration, 10) || 0;
    np.innerHTML = `
      ${pic ? `<div class="glow" style="background-image:url('${esc(pic)}')"></div>` : ''}
      ${pic ? `<img class="art" src="${esc(pic)}">`
            : `<div class="leegart">${svg('muziek')}</div>`}
      <div class="tx">
        <div class="t">${esc(titel)}</div>
        <div class="a">${esc(artiest)}</div>
        ${elders}
      </div>
      ${duur ? `<div class="voort">
        <div class="vbaan"><div class="vfill" id="vfill"></div></div>
        <div class="vtijd"><span id="vnu">0:00</span><span>${mmss(duur)}</span></div>
      </div>` : ''}
      <div class="ctr">
        <button class="shuf${a.shuffle ? ' on' : ''}" data-act="shuffle"
                title="${t.shuffleTitel}">${svg('shuffle')}</button>
        <button data-act="prev">${svg('prev')}</button>
        <button class="hoofd" data-act="pp">${svg(speelt ? 'pause' : 'play')}</button>
        <button data-act="next">${svg('next')}</button>
        <button class="rep${a.repeat && a.repeat !== 'off' ? ' on' : ''}" data-act="repeat"
                title="${t.herhaalTitel}">${svg(a.repeat === 'one' ? 'mdi:repeat-once' : 'mdi:repeat')}</button>
      </div>`;
    this._toonVoortgang();
  }

  // Afspeelpositie. Home Assistant stuurt alleen af en toe een nieuwe stand,
  // dus tellen we er tussendoor zelf bij op.
  _toonVoortgang() {
    const sr = this.shadowRoot;
    const fill = sr && sr.getElementById('vfill');
    if (!fill) return;
    const s = this._st(this._actief());
    const a = (s && s.attributes) || {};
    const duur = parseInt(a.media_duration, 10) || 0;
    if (!duur) return;
    let pos = parseFloat(a.media_position) || 0;
    if (s && s.state === 'playing' && a.media_position_updated_at) {
      pos += (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000;
    }
    pos = Math.max(0, Math.min(duur, pos));
    fill.style.width = (pos / duur * 100) + '%';
    const nu = sr.getElementById('vnu');
    if (nu) nu.textContent = mmss(Math.round(pos));
  }

  disconnectedCallback() {
    this._sleepLos();
    clearInterval(this._tikTimer);
    clearInterval(this._scrollTimer);
    if (this._maatLuister) {
      window.removeEventListener('resize', this._maatLuister);
      this._maatLuister = null;
    }
  }
}


// ---------------------------------------------------------------------------
// Visuele instellingen. Alles met keuzelijsten en invulvelden; YAML hoeft niet.
// ---------------------------------------------------------------------------

const EDSTYLE = `
:host { display:block; }
.vak { margin-bottom:18px; }
.kop { font-size:15px; font-weight:700; margin:0 0 8px; display:flex;
       align-items:center; justify-content:space-between; gap:10px; }
ha-expansion-panel { margin-bottom:8px; --expansion-panel-summary-padding:0 12px; }
.rij { display:flex; align-items:center; gap:8px; }
.blok { padding:4px 4px 12px; }
.knop { border:0; cursor:pointer; font:inherit; font-size:13px; font-weight:600;
        border-radius:999px; padding:7px 14px;
        background:var(--primary-color); color:var(--text-primary-color,#fff); }
.knop.weg { background:transparent; color:var(--error-color,#db4437); padding:6px 4px; }
.leeg { opacity:.6; font-size:13px; padding:4px 2px 10px; }
.tegels { padding-left:4px; }
.tegel { border-top:1px solid var(--divider-color); padding:10px 0 2px; }
.tegel:first-child { border-top:0; }
`;

const ED_LABEL = { path: 'pad', radio_mode: 'radio', count: 'aantal' };

// Hint line under a field in the editor. Only for the fields where a new user
// has nothing to go on - the media id above all: it is a plain text box and
// nothing on screen says what belongs in it or where to find it.
const ED_HINT = { uri: 'uriHint' };

class MusicAssistantTouchCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    const j = JSON.stringify(config || {});
    this._cfg = JSON.parse(j);
    if (j === this._laatst) return;   // onze eigen wijziging: niet herbouwen
    this._laatst = j;
    this._vuil = true;
    this._teken();
  }

  set hass(hass) {
    const eerste = !this._hass;
    this._hass = hass;
    if (eerste || this._vuil) this._teken();
    else this.shadowRoot.querySelectorAll('ha-form').forEach((f) => { f.hass = hass; });
  }

  _ed() {
    const g = ((this._cfg && this._cfg.language)
      || (this._hass && this._hass.language) || 'en').slice(0, 2).toLowerCase();
    return (TAAL[g] || TAAL.en).ed;
  }

  _soortNaam() {
    const g = ((this._cfg && this._cfg.language)
      || (this._hass && this._hass.language) || 'en').slice(0, 2).toLowerCase();
    return (TAAL[g] || TAAL.en).soort;
  }

  _melden() {
    this._laatst = JSON.stringify(this._cfg);
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._cfg }, bubbles: true, composed: true,
    }));
  }

  _herbouw() {
    this._melden();
    this._vuil = true;
    this._teken();
  }

  _mdi(naam) {
    const n = String(naam || '');
    if (!n) return '';
    return n.indexOf(':') > 0 ? n : (KORT[n] || '');
  }

  // Een ha-form met eigen labels. Data wordt eenmalig gezet; ha-form houdt
  // daarna zijn eigen invoer bij, dus typen verliest nooit de focus.
  _form(schema, data, bij) {
    const ed = this._ed();
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = (sch) => ed[ED_LABEL[sch.name] || sch.name] || sch.name;
    f.computeHelper = (sch) => ed[ED_HINT[sch.name]] || '';
    f.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      bij(ev.detail.value);
    });
    return f;
  }

  _knop(tekst, cls, bij) {
    const b = document.createElement('button');
    b.className = 'knop' + (cls ? ' ' + cls : '');
    b.textContent = tekst;
    b.addEventListener('click', bij);
    return b;
  }

  _paneel(titel, inhoud, weg) {
    const p = document.createElement('ha-expansion-panel');
    p.outlined = true;
    p.header = titel;
    const blok = document.createElement('div');
    blok.className = 'blok';
    blok.appendChild(inhoud);
    if (weg) {
      const r = document.createElement('div');
      r.className = 'rij';
      r.appendChild(this._knop(this._ed().weg, 'weg', weg));
      blok.appendChild(r);
    }
    p.appendChild(blok);
    return p;
  }

  _teken() {
    if (!this._hass || !this._cfg) return;
    this._vuil = false;
    const ed = this._ed();
    const sn = this._soortNaam();
    const c = this._cfg;
    const sr = this.shadowRoot;
    sr.innerHTML = `<style>${EDSTYLE}</style>`;
    const wortel = document.createElement('div');
    sr.appendChild(wortel);

    // ---- algemeen ----
    //
    // Only the one field you cannot do without sits in the open. The rest is
    // grouped by the question it answers - how it looks, how it plays, how it
    // searches - because a single column of fourteen settings tells a newcomer
    // nothing about which three of them matter.
    const algVak = document.createElement('div');
    algVak.className = 'vak';
    algVak.innerHTML = `<div class="kop">${ed.algemeen}</div>`;
    algVak.appendChild(this._form(
      [{ name: 'config_entry_id', required: true,
        selector: { config_entry: { integration: 'music_assistant' } } }],
      { config_entry_id: c.config_entry_id || '' },
      (v) => { this._cfg.config_entry_id = v.config_entry_id; this._melden(); }
    ));

    algVak.appendChild(this._paneel(ed.weergave, this._form(
      [
        { name: '', type: 'grid', schema: [
          { name: 'height', selector: { number: { min: 240, max: 1400, step: 2, mode: 'box' } } },
          { name: 'fill_margin', selector: { number: { min: 0, max: 200, step: 1, mode: 'box' } } },
        ] },
        { name: 'fill', selector: { boolean: {} } },
        { name: 'arrows', selector: { boolean: {} } },
        { name: 'language', selector: { select: { mode: 'dropdown', options: [
          { value: '', label: ed.automatisch },
          { value: 'nl', label: 'Nederlands' }, { value: 'en', label: 'English' },
        ] } } },
      ],
      {
        height: c.height == null ? 556 : c.height,
        fill_margin: c.fill_margin == null ? 8 : c.fill_margin,
        fill: c.fill === true,
        arrows: c.arrows !== false,
        language: c.language || '',
      },
      (v) => {
        this._cfg.height = v.height;
        if (v.fill_margin == null || v.fill_margin === '' || v.fill_margin === 8) {
          delete this._cfg.fill_margin;
        } else this._cfg.fill_margin = v.fill_margin;
        if (v.fill) this._cfg.fill = true; else delete this._cfg.fill;
        this._cfg.arrows = !!v.arrows;
        if (v.language) this._cfg.language = v.language; else delete this._cfg.language;
        this._melden();
      }
    )));

    algVak.appendChild(this._paneel(ed.spelenKop, this._form(
      [
        { name: '', type: 'grid', schema: [
          { name: 'volume_max', selector: { number: { min: 5, max: 100, step: 1, mode: 'box' } } },
          { name: 'volume_start', selector: { number: { min: 0, max: 100, step: 1, mode: 'box' } } },
        ] },
        { name: 'tile_action', selector: { select: { mode: 'dropdown', options: [
          { value: 'open', label: ed.openen }, { value: 'play', label: ed.afspelen },
        ] } } },
        { name: 'transfer_on_switch', selector: { boolean: {} } },
        { name: 'retry_next', selector: { boolean: {} } },
      ],
      {
        volume_max: c.volume_max == null ? 100 : c.volume_max,
        volume_start: c.volume_start == null ? null : c.volume_start,
        tile_action: c.tile_action || 'open',
        transfer_on_switch: c.transfer_on_switch !== false,
        retry_next: c.retry_next !== false,
      },
      (v) => {
        if (v.volume_max && v.volume_max !== 100) this._cfg.volume_max = v.volume_max;
        else delete this._cfg.volume_max;
        if (v.volume_start == null || v.volume_start === '') delete this._cfg.volume_start;
        else this._cfg.volume_start = v.volume_start;
        this._cfg.tile_action = v.tile_action;
        this._cfg.transfer_on_switch = !!v.transfer_on_switch;
        this._cfg.retry_next = !!v.retry_next;
        this._melden();
      }
    )));

    algVak.appendChild(this._paneel(ed.zoekKop, this._form(
      [
        { name: 'keyboard', selector: { boolean: {} } },
        { name: 'limit', selector: { number: { min: 6, max: 100, step: 1, mode: 'box' } } },
        { name: 'search_types', selector: { select: { multiple: true, mode: 'list', options: [
          { value: 'track', label: sn.track }, { value: 'album', label: sn.album },
          { value: 'artist', label: sn.artist }, { value: 'playlist', label: sn.playlist },
        ] } } },
      ],
      {
        keyboard: c.keyboard !== false,
        limit: c.limit == null ? 24 : c.limit,
        search_types: c.search_types || ['track', 'album', 'artist', 'playlist'],
      },
      (v) => {
        this._cfg.keyboard = !!v.keyboard;
        this._cfg.limit = v.limit;
        this._cfg.search_types = v.search_types;
        this._melden();
      }
    )));
    wortel.appendChild(algVak);

    // ---- speakers ----
    const zVak = document.createElement('div');
    zVak.className = 'vak';
    zVak.innerHTML = `<div class="kop">${ed.zones}</div>`;
    const zones = c.zones || [];
    const zSchema = [
      { name: '', type: 'grid', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ] },
      { name: 'entity', selector: { entity: { filter: { domain: 'media_player' } } } },
      { name: 'volume', selector: { entity: { filter: { domain: 'media_player' } } } },
      { name: '', type: 'grid', schema: [
        { name: 'volume_max', selector: { number: { min: 5, max: 100, step: 1, mode: 'box' } } },
        { name: 'volume_start', selector: { number: { min: 0, max: 100, step: 1, mode: 'box' } } },
      ] },
      { name: 'turn_off', selector: { entity: { filter: { domain: 'media_player' } } } },
      { name: 'unjoin', selector: { entity: { filter: { domain: 'media_player' } } } },
      { name: 'joinLeader', selector: { entity: { filter: { domain: 'media_player' } } } },
      { name: 'joinMembers',
        selector: { entity: { multiple: true, filter: { domain: 'media_player' } } } },
    ];
    zones.forEach((z, i) => {
      const b = z.before || {};
      const plat = {
        name: z.name || '', icon: this._mdi(z.icon), entity: z.entity || '',
        volume: z.volume || '', volume_max: z.volume_max == null ? null : z.volume_max,
        volume_start: z.volume_start == null ? null : z.volume_start,
        turn_off: b.turn_off || '', unjoin: b.unjoin || '',
        joinLeader: (b.join && b.join.leader) || '',
        joinMembers: (b.join && b.join.members) || [],
      };
      const form = this._form(zSchema, plat, (v) => {
        const zn = { name: v.name, entity: v.entity };
        if (v.icon) zn.icon = v.icon;
        if (v.volume) zn.volume = v.volume;
        if (v.volume_max != null && v.volume_max !== '') zn.volume_max = v.volume_max;
        if (v.volume_start != null && v.volume_start !== '') zn.volume_start = v.volume_start;
        const voor = {};
        if (v.turn_off) voor.turn_off = v.turn_off;
        if (v.unjoin) voor.unjoin = v.unjoin;
        if (v.joinLeader && (v.joinMembers || []).length) {
          voor.join = { leader: v.joinLeader, members: v.joinMembers };
        }
        if (Object.keys(voor).length) zn.before = voor;
        this._cfg.zones = (this._cfg.zones || []).slice();
        this._cfg.zones[i] = zn;
        this._melden();
      });
      zVak.appendChild(this._paneel(z.name || ed.naamloos, form, () => {
        this._cfg.zones = zones.filter((x, k) => k !== i);
        if (!this._cfg.zones.length) delete this._cfg.zones;
        this._herbouw();
      }));
    });
    zVak.appendChild(this._knop(ed.zoneToe, '', () => {
      this._cfg.zones = (this._cfg.zones || []).concat([{ name: '', entity: '' }]);
      this._herbouw();
    }));
    wortel.appendChild(zVak);

    // ---- categorieen ----
    const cVak = document.createElement('div');
    cVak.className = 'vak';
    cVak.innerHTML = `<div class="kop">${ed.cats}</div>`;
    const cats = c.categories || [];
    const tSchema = [
      { name: '', type: 'grid', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ] },
      { name: 'uri', required: true, selector: { text: {} } },
      { name: 'image', selector: { text: {} } },
      { name: '', type: 'grid', schema: [
        { name: 'play', selector: { boolean: {} } },
        { name: 'radio_mode', selector: { boolean: {} } },
      ] },
    ];
    cats.forEach((cat, ci) => {
      const binnen = document.createElement('div');
      const auto = !!cat.source;
      // The one question that decides what the rest of this panel looks like:
      // do you write the list, or does Music Assistant.
      binnen.appendChild(this._form(
        [
          { name: 'name', selector: { text: {} } },
          { name: 'vullen', selector: { select: { mode: 'dropdown', options: [
            { value: 'hand', label: ed.bronHand },
            { value: 'auto', label: ed.bronAuto },
          ] } } },
        ],
        { name: cat.name || '', vullen: auto ? 'auto' : 'hand' },
        (v) => {
          const lijst = (this._cfg.categories || []).slice();
          const nw = Object.assign({}, lijst[ci], { name: v.name });
          const wilAuto = v.vullen === 'auto';
          if (wilAuto && !nw.source) {
            nw.source = { media_type: 'playlist', limit: 12, order_by: 'last_played_desc' };
            delete nw.tiles;
          } else if (!wilAuto && nw.source) {
            delete nw.source;
            nw.tiles = nw.tiles || [];
          }
          lijst[ci] = nw;
          this._cfg.categories = lijst;
          if (wilAuto !== auto) this._herbouw(); else this._melden();
        }
      ));
      if (auto) {
        const br = cat.source || {};
        binnen.appendChild(this._form(
          [
            { name: '', type: 'grid', schema: [
              { name: 'media_type', selector: { select: { mode: 'dropdown', options: [
                { value: 'playlist', label: sn.playlist }, { value: 'album', label: sn.album },
                { value: 'artist', label: sn.artist }, { value: 'track', label: sn.track },
                { value: 'radio', label: sn.radio },
              ] } } },
              { name: 'count', selector: { number: { min: 1, max: 100, step: 1, mode: 'box' } } },
            ] },
            { name: 'order_by', selector: { select: { mode: 'dropdown', options: [
              { value: '', label: ed.ordStandaard },
              { value: 'last_played_desc', label: ed.ordRecent },
              { value: 'timestamp_added_desc', label: ed.ordNieuw },
              { value: 'random', label: ed.ordRandom },
            ] } } },
            { name: 'favorite', selector: { boolean: {} } },
            { name: 'play', selector: { boolean: {} } },
          ],
          {
            media_type: br.media_type || 'playlist',
            count: br.limit == null ? 12 : br.limit,
            order_by: br.order_by || '',
            favorite: br.favorite === true,
            play: br.play === true,
          },
          (v) => {
            const bron = { media_type: v.media_type, limit: v.count || 12 };
            if (v.order_by) bron.order_by = v.order_by;
            if (v.favorite) bron.favorite = true;
            if (v.play) bron.play = true;
            const lijst = (this._cfg.categories || []).slice();
            lijst[ci] = Object.assign({}, lijst[ci], { source: bron });
            this._cfg.categories = lijst;
            this._melden();
          }
        ));
      }
      const tegels = document.createElement('div');
      tegels.className = 'tegels';
      (auto ? [] : cat.tiles || []).forEach((tg, ti) => {
        const rij = document.createElement('div');
        rij.className = 'tegel';
        rij.appendChild(this._form(tSchema, {
          name: tg.name || '', icon: this._mdi(tg.icon), uri: tg.uri || '',
          image: tg.image || '', play: !!tg.play, radio_mode: !!tg.radio_mode,
        }, (v) => {
          const nt = { name: v.name, uri: v.uri };
          if (v.image) nt.image = v.image;
          else if (v.icon) nt.icon = v.icon;
          if (v.play) nt.play = true;
          if (v.radio_mode) nt.radio_mode = true;
          const lijst = (this._cfg.categories[ci].tiles || []).slice();
          lijst[ti] = nt;
          this._cfg.categories[ci] = Object.assign({}, this._cfg.categories[ci], { tiles: lijst });
          this._melden();
        }));
        const wr = document.createElement('div');
        wr.className = 'rij';
        wr.appendChild(this._knop(ed.weg, 'weg', () => {
          this._cfg.categories[ci].tiles = (cat.tiles || []).filter((x, k) => k !== ti);
          this._herbouw();
        }));
        rij.appendChild(wr);
        tegels.appendChild(rij);
      });
      binnen.appendChild(tegels);
      if (!auto) {
        binnen.appendChild(this._knop(ed.tegelToe, '', () => {
          this._cfg.categories[ci].tiles = (cat.tiles || []).concat([{ name: '', uri: '' }]);
          this._herbouw();
        }));
      }
      const kop = (cat.name || ed.naamloos) + '  ·  ' + (auto
        ? ed.autoTegels
        : ((cat.tiles || []).length) + ' ' + ed.tegels.toLowerCase());
      cVak.appendChild(this._paneel(kop, binnen, () => {
        this._cfg.categories = cats.filter((x, k) => k !== ci);
        if (!this._cfg.categories.length) delete this._cfg.categories;
        this._herbouw();
      }));
    });
    cVak.appendChild(this._knop(ed.catToe, '', () => {
      this._cfg.categories = (this._cfg.categories || []).concat([{ name: '', tiles: [] }]);
      this._herbouw();
    }));
    wortel.appendChild(cVak);

    // ---- navigatieknoppen ----
    const lVak = document.createElement('div');
    lVak.className = 'vak';
    lVak.innerHTML = `<div class="kop">${ed.links}</div>`;
    const links = c.links || [];
    const lSchema = [
      { name: '', type: 'grid', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ] },
      { name: 'path', selector: { text: {} } },
    ];
    links.forEach((l, li) => {
      const form = this._form(lSchema,
        { name: l.name || '', icon: this._mdi(l.icon), path: l.path || '' },
        (v) => {
          this._cfg.links = (this._cfg.links || []).slice();
          this._cfg.links[li] = { name: v.name, icon: v.icon, path: v.path };
          this._melden();
        });
      lVak.appendChild(this._paneel(l.name || ed.naamloos, form, () => {
        this._cfg.links = links.filter((x, k) => k !== li);
        if (!this._cfg.links.length) delete this._cfg.links;
        this._herbouw();
      }));
    });
    lVak.appendChild(this._knop(ed.linkToe, '', () => {
      this._cfg.links = (this._cfg.links || []).concat([{ name: '', icon: 'mdi:home', path: '' }]);
      this._herbouw();
    }));
    wortel.appendChild(lVak);
  }
}

customElements.define('touch-music-card-editor', MusicAssistantTouchCardEditor);

customElements.define('touch-music-card', MusicAssistantTouchCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'touch-music-card',
  name: 'Touch music card',
  preview: false,
  description: 'Music Assistant player, library and search in one card, built for touch panels',
  documentationURL: 'https://github.com/mnrgrrt/touch-music-card',
});

console.info(
  `%c TOUCH-MUSIC-CARD %c ${VERSIE} `,
  'color:#fff;background:#1DB954;font-weight:700',
  'color:#1DB954;background:#222'
);

