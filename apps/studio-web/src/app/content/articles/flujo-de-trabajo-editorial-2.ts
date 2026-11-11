// Parte 2 de la guía "Flujo de trabajo editorial" (secciones 9–12).
export const PART_2 = `
<h2 id="seo-editorial">SEO editorial dentro del flujo</h2>
<p>El SEO editorial no es un truco para engañar a los buscadores, sino el conjunto de decisiones que hacen que una pieza útil sea encontrada por quien la necesita. La clave es repartir esas decisiones a lo largo del flujo en lugar de concentrarlas al final. Así cada persona hace una parte pequeña en el momento en que tiene la información para hacerla bien.</p>
<h3>En la planificación: el tema y la intención</h3>
<p>La decisión de SEO más importante se toma antes de escribir una sola palabra: qué búsqueda va a responder la pieza y si tu medio ya tiene otra que la responde. Publicar dos piezas que compiten por la misma búsqueda divide la autoridad entre ambas y confunde al lector. Antes de encargar, comprueba si existe una pieza propia sobre el tema; si existe y está desactualizada, actualízala en lugar de crear otra.</p>
<h3>En el encargo: búsqueda objetivo y piezas relacionadas</h3>
<p>El encargo debe incluir la búsqueda objetivo, las preguntas relacionadas que conviene responder y las piezas propias a las que enlazar. Con eso, el periodista puede escribir pensando en el lector y en la búsqueda a la vez, sin tener que adivinar qué espera el equipo de audiencia.</p>
<h3>En la redacción: estructura que responde</h3>
<ul>
<li><strong>Responde pronto.</strong> El primer párrafo debe contestar a la pregunta principal. El lector que busca «cuándo se cobra la paga extra» quiere la fecha, no una introducción histórica.</li>
<li><strong>Intertítulos descriptivos.</strong> Los intertítulos deben decir qué contiene cada apartado. Ayudan a escanear, a navegar con lectores de pantalla y a que los buscadores entiendan la pieza.</li>
<li><strong>Un tema por pieza.</strong> Si el texto empieza a responder a otra búsqueda distinta, probablemente sea una pieza satélite que merece su propio encargo.</li>
<li><strong>Profundidad real.</strong> La extensión no es un objetivo. Una pieza debe ser tan larga como necesite para responder bien, y aportar algo que no esté ya en las primeras posiciones: datos propios, contexto, experiencia, ejemplos.</li>
</ul>
<h3>En la preparación: los elementos técnicos</h3>
<table>
<thead><tr><th>Elemento</th><th>Recomendación práctica</th></tr></thead>
<tbody>
<tr><td>Título SEO</td><td>Claro, con la búsqueda principal al principio cuando sea natural. Alrededor de 50 a 60 caracteres para que no se corte en la mayoría de resultados.</td></tr>
<tr><td>Titular en portada</td><td>Puede ser distinto y más editorial, pero no debe prometer algo que la pieza no cumple.</td></tr>
<tr><td>Meta descripción</td><td>Resume lo que el lector va a encontrar en unos 150 a 160 caracteres. No garantiza que el buscador la muestre, pero ayuda cuando lo hace.</td></tr>
<tr><td>URL</td><td>Corta, legible y sin fechas si la pieza va a actualizarse. No se cambia después de publicar salvo con redirección permanente.</td></tr>
<tr><td>Imagen principal</td><td>De buena calidad, relevante y con al menos 1.200 píxeles de ancho si quieres optar a formatos con imagen grande en buscadores y recomendaciones.</td></tr>
<tr><td>Texto alternativo</td><td>Describe la imagen para quien no puede verla. No es un lugar para repetir palabras clave.</td></tr>
<tr><td>Enlaces internos</td><td>Entre dos y cinco enlaces a piezas propias relevantes, con texto de enlace descriptivo.</td></tr>
<tr><td>Datos estructurados</td><td>Marcado de artículo o noticia con titular, imagen, fechas de publicación y modificación y autoría. Preguntas frecuentes solo cuando la pieza las contiene de verdad.</td></tr>
<tr><td>Autoría</td><td>Firma visible con enlace a una página de autor que explique quién es y por qué sabe del tema.</td></tr>
</tbody>
</table>
<h3>Fechas honestas</h3>
<p>La fecha de modificación debe cambiar cuando la pieza cambia de forma significativa, no cada vez que alguien corrige una coma ni de forma automática para parecer más reciente. Los buscadores y los lectores detectan las fechas infladas, y una pieza que dice estar actualizada hoy pero contiene datos de hace dos años pierde credibilidad.</p>
<h3>Rendimiento de la página</h3>
<p>La experiencia de página también forma parte del flujo, aunque dependa más del equipo técnico que del editorial. Las métricas de Core Web Vitals que usa Google consideran buena una carga del elemento principal en menos de 2,5 segundos, una respuesta a la interacción por debajo de 200 milisegundos y un desplazamiento visual acumulado inferior a 0,1. Lo que sí depende de la redacción es el peso de las imágenes, el número de elementos incrustados y la cantidad de publicidad o módulos que se añaden a cada pieza. Conviene que la lista de control incluya, al menos, que las imágenes estén comprimidas y tengan dimensiones definidas.</p>
<h3>Experiencia, autoridad y confianza</h3>
<p>Las directrices de calidad de los buscadores insisten en la experiencia, la pericia, la autoridad y la fiabilidad del contenido. En la práctica, eso se traduce en decisiones del flujo: firmar con nombre real, enlazar las fuentes, explicar la metodología cuando hay datos propios, señalar las correcciones, mostrar quién edita y tener páginas de autor y de la redacción que expliquen quién está detrás. Ninguna de estas cosas requiere tecnología especial; solo requiere que alguien tenga asignada la tarea de comprobarlas.</p>

<h2 id="checklist">Control de calidad: la lista previa a publicar</h2>
<p>La lista de control previa a la publicación es la herramienta con mejor relación entre esfuerzo y resultado de todo el flujo. Bien diseñada, evita la mayoría de errores visibles sin ralentizar el trabajo. Mal diseñada, se convierte en un trámite que todo el mundo marca sin leer.</p>
<h3>Principios de una buena lista de control</h3>
<ul>
<li><strong>Corta:</strong> entre ocho y quince puntos. Si tiene cuarenta, nadie la cumple.</li>
<li><strong>Verificable:</strong> cada punto se puede comprobar con un sí o un no. «Buena calidad» no es verificable; «título de 60 caracteres o menos» sí.</li>
<li><strong>Automatizada donde se pueda:</strong> la longitud del título, la presencia de meta descripción, el texto alternativo de las imágenes o la validez de los datos estructurados se pueden comprobar automáticamente. Las personas deben dedicar su atención a lo que una máquina no puede juzgar.</li>
<li><strong>Bloqueante solo para lo grave:</strong> distingue entre avisos y bloqueos. Una imagen sin texto alternativo puede bloquear la publicación; una sugerencia de enlace interno adicional, no.</li>
<li><strong>Adaptada al formato:</strong> una última hora no necesita la misma lista que un reportaje.</li>
</ul>
<h3>Ejemplo de lista para un artículo estándar</h3>
<ol>
<li>El primer párrafo responde a la pregunta principal del encargo.</li>
<li>Todas las cifras, fechas y citas tienen fuente identificada.</li>
<li>Las fuentes primarias están enlazadas cuando son públicas.</li>
<li>El título SEO tiene 60 caracteres o menos y contiene la búsqueda principal.</li>
<li>La meta descripción existe y tiene 160 caracteres o menos.</li>
<li>La imagen principal tiene derechos de uso, al menos 1.200 píxeles de ancho y texto alternativo.</li>
<li>Hay al menos dos enlaces internos a piezas relacionadas.</li>
<li>Los datos estructurados de artículo son válidos y las fechas son correctas.</li>
<li>La pieza está firmada y la autoría enlaza a una página de autor.</li>
<li>No hay errores ortográficos detectados por el corrector.</li>
<li>Las versiones para cada canal están preparadas y revisadas.</li>
<li>El editor ha revisado la pieza y no quedan comentarios abiertos.</li>
</ol>
<h3>Quién ejecuta la lista</h3>
<p>Lo ideal es que la lista se ejecute en dos momentos: el redactor o quien prepara la pieza la repasa antes de pedir la aprobación, y el aprobador ve el resultado de las comprobaciones automáticas junto al texto en el momento de aprobar. Si el sistema muestra en una sola pantalla el borrador y el estado de cada comprobación, la aprobación deja de ser un acto de fe y se convierte en una decisión informada.</p>
<aside class="callout"><p><strong>Revisa la lista cada trimestre.</strong> Mira qué errores han llegado al lector en los últimos tres meses y pregúntate si un punto de la lista los habría evitado. Añade ese punto y retira los que nunca detectan nada. Una lista de control es un documento vivo.</p></aside>

<h2 id="multicanal">Publicación multicanal y en varias webs</h2>
<p>Publicar ya no es pulsar un botón en el CMS. Una misma pieza puede salir en la web principal, en una web hermana con un enfoque local, en un boletín, en varias redes sociales, en agregadores y en webs de socios que republican contenido. Cada destino tiene su formato, su horario ideal y sus reglas. Gestionarlo a mano es una fuente constante de errores.</p>
<h3>Una pieza, varias salidas</h3>
<p>El principio que mejor funciona es mantener una única versión de referencia de la pieza, la aprobada, y derivar de ella las versiones para cada destino. Si se corrige la versión de referencia, la corrección se propaga o, al menos, se avisa de qué destinos tienen una versión anterior. Lo contrario, copiar y pegar el texto en cada sitio, garantiza que tarde o temprano haya versiones distintas de la misma información.</p>
<h3>Reglas por destino</h3>
<table>
<thead><tr><th>Destino</th><th>Formato habitual</th><th>Reglas a definir</th></tr></thead>
<tbody>
<tr><td>Web principal</td><td>Pieza completa con datos estructurados.</td><td>Sección, etiquetas, autoría, horario de publicación.</td></tr>
<tr><td>Web hermana o local</td><td>Versión adaptada o resumida.</td><td>Qué partes se mantienen, enlace canónico a la original si el texto es casi idéntico.</td></tr>
<tr><td>Boletín</td><td>Resumen con enlace.</td><td>En qué edición entra y con qué titular.</td></tr>
<tr><td>Red social de texto</td><td>Hilo o publicación corta.</td><td>Número de mensajes, tono, horario.</td></tr>
<tr><td>Red social visual</td><td>Carrusel o imagen con texto.</td><td>Diseño, número de tarjetas, texto de apoyo.</td></tr>
<tr><td>Socios y agregadores</td><td>Titular, resumen y enlace, o pieza completa.</td><td>Qué campos se comparten y con qué licencia.</td></tr>
</tbody>
</table>
<h3>Contenido duplicado entre webs</h3>
<p>Cuando un grupo publica el mismo texto en varias webs, conviene decidir cuál es la versión original y señalarlo con una etiqueta canónica en las demás. Si cada web adapta el texto de forma sustancial, con datos locales o un enfoque distinto, puede tener su propia versión indexable. Lo que se debe evitar es publicar textos casi idénticos en varias webs sin ninguna indicación, porque compiten entre sí en los resultados de búsqueda.</p>
<h3>Cuando la publicación falla</h3>
<p>Las publicaciones fallan: una contraseña de aplicación caduca, una red social cambia su API, un servidor no responde. El flujo debe prever qué ocurre entonces. Lo razonable es que el sistema reintente automáticamente las veces que tenga sentido, que avise a una persona concreta si el fallo persiste y que la ficha de la pieza muestre claramente en qué destinos se ha publicado y en cuáles no. Descubrir días después que una pieza nunca salió en una de las webs es uno de los fallos más frustrantes y más fáciles de evitar.</p>
<h3>Programación y horarios</h3>
<p>Cada canal tiene sus horas de mayor audiencia, y no siempre coinciden. Programar la salida por destino, en lugar de publicar todo a la vez, mejora el alcance sin trabajo adicional. El calendario de publicación debería mostrar todas las salidas programadas de todas las webs y canales en una sola vista, para detectar huecos y saturaciones.</p>

<h2 id="actualizacion">Actualización de contenidos atemporales</h2>
<p>Una parte importante del tráfico de búsqueda de un medio suele llegar a piezas que no son de actualidad: guías de servicio, explicativos, preguntas frecuentes, listados de recursos. Son piezas que siguen siendo útiles meses o años después, siempre que se mantengan al día. Tratarlas como piezas de actualidad, que se publican y se olvidan, es desperdiciar uno de los activos más valiosos de la redacción.</p>
<h3>Cómo identificar qué actualizar</h3>
<ul>
<li><strong>Piezas que pierden tráfico:</strong> si una guía que traía visitas estables empieza a caer, puede que haya quedado desactualizada o que otra pieza responda mejor.</li>
<li><strong>Piezas con datos caducados:</strong> cifras, precios, plazos o normas que cambian cada año.</li>
<li><strong>Piezas estacionales:</strong> calendarios escolares, campañas fiscales, festivos o eventos anuales que conviene actualizar antes de que empiece la temporada de búsqueda.</li>
<li><strong>Piezas que se canibalizan:</strong> varias piezas propias que responden a la misma búsqueda y que conviene fusionar en una sola.</li>
</ul>
<h3>El flujo de actualización</h3>
<p>Actualizar una pieza debería seguir un flujo similar al de una pieza nueva, aunque más corto: un encargo de actualización con lo que hay que revisar, una edición, las comprobaciones previas y una aprobación. La URL se mantiene, la fecha de modificación cambia solo si el cambio es significativo, y conviene indicar al lector qué se ha actualizado y cuándo.</p>
<h3>Fusionar y retirar</h3>
<p>No todo merece actualizarse. Cuando varias piezas cubren lo mismo, lo habitual es quedarse con la mejor, incorporar lo útil de las demás y redirigir las antiguas a la elegida con una redirección permanente. Las piezas que han perdido todo sentido y no reciben visitas pueden retirarse, devolviendo un código de error adecuado o redirigiendo a una pieza relacionada si existe. Un archivo más pequeño y mejor mantenido suele rendir mejor que uno enorme lleno de piezas obsoletas.</p>
<h3>Un calendario de revisión</h3>
<p>Asigna a cada pieza atemporal una fecha de revisión según lo rápido que caduca su contenido: tres meses para piezas con precios o normativa cambiante, seis meses para guías generales, un año para explicativos de fondo. El sistema editorial puede avisar cuando una pieza llega a su fecha, de modo que la actualización entre en la planificación semanal como un encargo más.</p>
`;
