// Parte 1 de la guía "Flujo de trabajo editorial" (secciones 1–8).
export const PART_1 = `
<p>Cualquier redacción tiene un flujo de trabajo editorial, aunque nunca lo haya escrito. Existe en la forma en que se decide qué se cubre, en quién lee un texto antes de que salga, en el momento en que alguien se acuerda de revisar el título para buscadores y en la manera en que una pieza termina, o no, en las redes sociales. La diferencia entre un medio que publica con calma y otro que vive apagando fuegos casi nunca está en el talento de sus periodistas: está en si ese flujo es explícito, compartido y medible, o si depende de la memoria de tres personas.</p>
<p>Esta guía explica cómo diseñar el flujo de trabajo editorial de un medio digital de principio a fin. Está pensada para directores de contenido, jefes de sección, responsables de SEO y equipos de producto que quieren ordenar su forma de trabajar sin convertir la redacción en una oficina de trámites. Cubre las fases, los roles, el lugar que ocupan el SEO y la inteligencia artificial, los controles de calidad previos a la publicación, la distribución en varias webs y canales, las métricas que de verdad importan y un plan para implantarlo en treinta días.</p>
<p>No hace falta aplicarlo todo a la vez. Lo útil es entender la lógica completa y después decidir qué piezas necesita tu equipo hoy y cuáles pueden esperar.</p>

<h2 id="que-es">Qué es un flujo de trabajo editorial (y qué no es)</h2>
<p>Un flujo de trabajo editorial es la secuencia acordada de pasos, responsables y criterios por la que pasa una pieza desde que alguien propone el tema hasta que se publica, se distribuye y, con el tiempo, se actualiza o se retira. Tiene tres componentes inseparables:</p>
<ul>
<li><strong>Fases:</strong> los estados por los que pasa una pieza, por ejemplo propuesta, encargada, en redacción, en edición, lista para revisión, aprobada, programada, publicada y en actualización.</li>
<li><strong>Responsables:</strong> quién mueve la pieza de una fase a la siguiente y quién tiene la última palabra en cada paso.</li>
<li><strong>Criterios de paso:</strong> qué tiene que cumplirse para avanzar. Un texto no pasa a «aprobado» porque alguien lo haya mirado, sino porque cumple una lista concreta de condiciones.</li>
</ul>
<p>Conviene distinguirlo de otras cosas con las que a menudo se confunde:</p>
<ul>
<li><strong>No es el CMS.</strong> El gestor de contenidos es donde se almacena y se publica la pieza. El flujo editorial es el proceso que la lleva hasta ahí. Muchos CMS tienen estados como «borrador» o «pendiente de revisión», pero eso solo cubre una parte del recorrido y casi nunca la planificación ni la distribución.</li>
<li><strong>No es el calendario editorial.</strong> El calendario dice qué se publica y cuándo. El flujo dice cómo se produce. Un calendario sin flujo es una lista de deseos; un flujo sin calendario funciona, pero sin ritmo.</li>
<li><strong>No es un manual de estilo.</strong> El libro de estilo define cómo se escribe. El flujo define quién comprueba que se ha escrito así y en qué momento.</li>
<li><strong>No es burocracia.</strong> Un buen flujo elimina pasos, no los añade. Si después de definirlo el equipo tarda más en publicar una pieza urgente, el diseño está mal.</li>
</ul>
<p>Una forma práctica de saber si tu flujo existe de verdad es hacer tres preguntas a cinco personas distintas de la redacción: ¿quién aprueba una pieza antes de publicarla?, ¿qué se comprueba antes de aprobarla? y ¿qué pasa si la publicación falla en una de las webs? Si las respuestas no coinciden, el flujo está en la cabeza de cada uno y no en un sistema compartido.</p>

<h2 id="por-que">Por qué un medio digital necesita un flujo editorial definido</h2>
<p>En una redacción pequeña, con una sola web y cinco personas que se sientan juntas, el flujo puede ser informal durante bastante tiempo. Los problemas aparecen cuando crece cualquiera de estas variables: el número de personas, el número de webs o canales, el volumen de piezas o la presión por el tráfico de búsqueda.</p>
<h3>El coste de la coordinación invisible</h3>
<p>Cuando el proceso no está escrito, cada pieza requiere coordinación manual: mensajes para preguntar si un texto está listo, recordatorios para que alguien añada la imagen, correcciones de última hora porque nadie revisó el titular para buscadores. Ese tiempo no aparece en ningún informe, pero se come buena parte de la jornada de los editores. Un flujo explícito convierte esa coordinación en información visible: cualquiera puede ver en qué estado está una pieza y qué le falta.</p>
<h3>Errores que llegan al lector</h3>
<p>Los errores más habituales en medios digitales no son de periodismo, son de proceso: una pieza publicada sin imagen o con una imagen sin texto alternativo, un título que se corta en los resultados de búsqueda, un enlace roto, una fecha equivocada en los datos estructurados, un artículo que se publica en una web y no en la otra, o una corrección que se aplica en la web pero no en el boletín. Casi todos se evitan con una comprobación previa que alguien tiene asignada.</p>
<h3>El SEO llega tarde</h3>
<p>En muchos medios el SEO funciona como un control posterior: el texto se escribe, se publica y luego alguien del equipo de audiencia propone cambiar el título o añadir enlaces. Para entonces la pieza ya ha tenido su momento de máxima visibilidad. Integrar el SEO dentro del flujo, desde la elección del tema hasta la revisión previa, cambia el resultado sin aumentar el trabajo, porque las decisiones se toman una vez y en el momento adecuado.</p>
<h3>Varias webs, varias versiones de la verdad</h3>
<p>Los grupos que gestionan varias cabeceras o webs temáticas suelen acabar con un proceso distinto para cada una. Eso multiplica el esfuerzo de formación, hace imposible comparar resultados y provoca que la misma información se publique con datos distintos según la web. Un flujo común con reglas por destino permite que cada web mantenga su personalidad sin que el proceso se tenga que reinventar.</p>
<h3>La inteligencia artificial necesita un carril</h3>
<p>La llegada de herramientas de IA generativa a las redacciones ha hecho más urgente tener un flujo definido. Sin él, la IA se usa de forma desigual: unos periodistas la usan para todo, otros para nada, y nadie sabe qué textos han pasado por una herramienta ni quién los ha verificado. Con un flujo claro, la IA tiene un lugar concreto, unas tareas permitidas y una revisión humana obligatoria antes de publicar.</p>

<h2 id="fases">Las fases de un flujo editorial moderno</h2>
<p>No existe un número correcto de fases. Un flujo demasiado corto no permite saber dónde está el atasco; uno demasiado largo obliga a mover piezas entre estados que no aportan nada. Para la mayoría de medios digitales funciona bien un esquema de diez pasos agrupados en cuatro bloques.</p>
<h3>Bloque 1: planificar</h3>
<ol>
<li><strong>Propuesta.</strong> Alguien sugiere un tema: un periodista, el equipo de audiencia, una alerta de actualidad o un análisis de demanda de búsqueda. La propuesta incluye, como mínimo, el tema, el enfoque y por qué merece la pena ahora.</li>
<li><strong>Encargo.</strong> El jefe de sección acepta la propuesta y la convierte en un encargo con responsable, fecha, formato, búsqueda objetivo y destinos de publicación. A partir de aquí la pieza existe oficialmente.</li>
</ol>
<h3>Bloque 2: producir</h3>
<ol start="3">
<li><strong>Redacción.</strong> El periodista investiga y escribe. Las fuentes, los datos y las imágenes candidatas se adjuntan a la pieza, no a un correo aparte.</li>
<li><strong>Edición.</strong> Un editor revisa estructura, claridad, estilo y datos. Puede devolver la pieza a redacción con comentarios concretos.</li>
<li><strong>Preparación para publicar.</strong> Se completan título SEO, meta descripción, imagen principal con texto alternativo, enlaces internos, etiquetas y versiones para cada canal.</li>
</ol>
<h3>Bloque 3: aprobar</h3>
<ol start="6">
<li><strong>Comprobaciones previas.</strong> Se ejecuta la lista de control: longitud del título, meta descripción, datos estructurados válidos, imágenes, fuentes enlazadas, ortografía. Lo que se pueda automatizar se automatiza.</li>
<li><strong>Aprobación.</strong> Una persona con autoridad editorial aprueba la pieza. La aprobación queda registrada con nombre y hora.</li>
</ol>
<h3>Bloque 4: publicar y mantener</h3>
<ol start="8">
<li><strong>Publicación y distribución.</strong> La pieza sale a cada web y canal con su formato y su horario. Si un destino falla, se reintenta y se avisa.</li>
<li><strong>Medición.</strong> Se recogen los resultados: tráfico, posición en buscadores, tiempo de lectura, interacciones, suscripciones si aplica.</li>
<li><strong>Actualización o retirada.</strong> Las piezas que siguen siendo útiles se actualizan periódicamente; las que han perdido sentido se fusionan, se redirigen o se retiran.</li>
</ol>
<p>Las piezas urgentes no deberían saltarse fases, sino recorrerlas más deprisa. Una última hora puede pasar de propuesta a publicación en diez minutos si el flujo permite que la misma persona encargue, edite y apruebe, y si la lista de control se reduce a lo imprescindible para ese formato. Lo que no debería pasar nunca es que una pieza llegue al lector sin que nadie la haya aprobado.</p>
<aside class="callout"><p><strong>Consejo:</strong> nombra las fases con verbos o estados que todo el mundo entienda sin explicación. «Lista para revisión» es mejor que «Fase 4». Si alguien nuevo no sabe qué significa un estado, ese estado sobra o está mal nombrado.</p></aside>

<h2 id="roles">Roles y responsabilidades en la redacción</h2>
<p>Las fases solo funcionan si cada una tiene un dueño. En la mayoría de medios digitales intervienen estos roles, aunque una misma persona pueda asumir varios:</p>
<table>
<thead><tr><th>Rol</th><th>Qué hace en el flujo</th><th>Decide sobre</th></tr></thead>
<tbody>
<tr><td>Dirección o jefatura de contenidos</td><td>Define prioridades, criterios de calidad y reglas de publicación.</td><td>Qué se cubre y con qué estándar.</td></tr>
<tr><td>Jefe de sección</td><td>Acepta propuestas, encarga piezas, asigna responsables y fechas.</td><td>El encargo y su prioridad.</td></tr>
<tr><td>Periodista o redactor</td><td>Investiga, escribe y adjunta fuentes, datos e imágenes.</td><td>El contenido de su borrador.</td></tr>
<tr><td>Editor</td><td>Revisa estructura, estilo y datos; devuelve o da por buena la edición.</td><td>Si el texto está listo para preparar.</td></tr>
<tr><td>Responsable de SEO o audiencia</td><td>Aporta la demanda de búsqueda, revisa títulos, enlazado y datos estructurados.</td><td>La optimización para buscadores.</td></tr>
<tr><td>Fotografía o diseño</td><td>Selecciona o produce imágenes, gráficos y tarjetas sociales.</td><td>Los recursos visuales.</td></tr>
<tr><td>Redes y distribución</td><td>Adapta la pieza a cada canal y programa su salida.</td><td>Formato y horario por canal.</td></tr>
<tr><td>Aprobador</td><td>Da el visto bueno final antes de publicar.</td><td>Si la pieza se publica.</td></tr>
</tbody>
</table>
<h3>Usa una matriz RACI sencilla</h3>
<p>Para evitar ambigüedades, asigna a cada fase quién es <em>responsable</em> de hacerla, quién tiene que <em>aprobarla</em>, a quién hay que <em>consultar</em> y a quién basta con <em>informar</em>. No hace falta un documento largo: una tabla de diez filas es suficiente. Lo importante es que en cada fase haya una sola persona que aprueba. Cuando dos personas pueden aprobar, en la práctica ninguna se siente responsable.</p>
<h3>La aprobación siempre es humana</h3>
<p>Aunque una parte del trabajo esté automatizada o asistida por IA, la decisión de publicar debe tomarla una persona identificable. Es una cuestión de responsabilidad editorial y también de confianza: el lector y los buscadores valoran cada vez más saber quién responde de lo que se publica. Registrar quién aprobó cada pieza no es desconfiar del equipo, es proteger a todos cuando algo sale mal.</p>
<h3>Roles en equipos pequeños</h3>
<p>En una redacción de tres personas no hay ocho roles, pero sí ocho responsabilidades. Lo habitual es que el redactor prepare la pieza para publicar, que otra persona la edite y apruebe, y que la distribución se programe al aprobar. La regla mínima que conviene mantener incluso en equipos muy pequeños es que quien escribe no sea quien aprueba, salvo en urgencias muy concretas que queden registradas.</p>

<h2 id="planificacion">Planificación basada en la demanda de búsqueda</h2>
<p>Decidir qué cubrir es la decisión editorial más importante y, a menudo, la menos estructurada. La intuición periodística sigue siendo imprescindible, pero hoy se puede complementar con datos que antes no estaban disponibles: qué busca la gente, qué temas tiene ya cubiertos tu medio y cuáles cubren tus competidores.</p>
<h3>Tres señales para priorizar temas</h3>
<ul>
<li><strong>Demanda:</strong> cuánta gente busca información sobre el tema y si esa búsqueda está creciendo. Las tendencias de búsqueda, las consultas que ya traen tráfico a tu web y las preguntas relacionadas que muestran los buscadores son buenas fuentes.</li>
<li><strong>Hueco de cobertura:</strong> si tu medio ya tiene una pieza que responde a esa búsqueda, si está desactualizada o si no existe. Muchas veces la mejor pieza nueva es una actualización de una antigua.</li>
<li><strong>Actualidad:</strong> si hay un motivo para publicar ahora, como un anuncio, un evento, una fecha límite o un cambio normativo.</li>
</ul>
<p>Combinar las tres señales en una puntuación sencilla ayuda a ordenar la reunión de planificación. No se trata de dejar que una cifra decida por la redacción, sino de llegar a la reunión con una lista ordenada y discutir las excepciones, no la lista entera.</p>
<h3>Del tema a la intención de búsqueda</h3>
<p>Un mismo tema puede responder a intenciones muy distintas. «Presupuestos 2027» puede significar qué cambia para las familias, cuándo se votan, qué partidas suben o cómo afectan a los autónomos. Cada intención pide un formato distinto: un explicativo, una pieza de última hora, un gráfico o unas preguntas frecuentes. Parte del trabajo de planificación es decidir qué intención vas a atender y con qué formato, y dejarlo escrito en el encargo.</p>
<h3>Clusters temáticos en lugar de piezas sueltas</h3>
<p>Los medios que mejor rinden en buscadores suelen organizar su cobertura en grupos de piezas relacionadas: una pieza principal que explica el tema en profundidad y varias piezas satélite que responden a preguntas concretas, todas enlazadas entre sí. Planificar en clusters tiene ventajas editoriales además de las de SEO: evita repetir información en cada pieza, facilita actualizar la cobertura y da al lector un camino claro para profundizar.</p>
<h3>El ritmo de la planificación</h3>
<p>La mayoría de redacciones combinan tres horizontes: una planificación diaria para la actualidad, una semanal para piezas propias y explicativos, y una trimestral para grandes coberturas, especiales y actualización de contenidos atemporales. El flujo editorial debe recoger los tres, de modo que una pieza planificada hace semanas y una última hora de hoy compartan las mismas fases y controles.</p>

<h2 id="encargo">El encargo editorial: qué debe incluir</h2>
<p>El encargo, o brief, es el contrato entre quien pide una pieza y quien la escribe. Un buen encargo ahorra más tiempo que cualquier herramienta, porque evita reescrituras por malentendidos. Un mal encargo, o la ausencia de encargo, es la causa más frecuente de piezas que llegan a edición sin el enfoque correcto.</p>
<h3>Plantilla mínima de encargo</h3>
<table>
<thead><tr><th>Campo</th><th>Para qué sirve</th><th>Ejemplo</th></tr></thead>
<tbody>
<tr><td>Tema y enfoque</td><td>Qué se cuenta y desde qué ángulo.</td><td>Qué cambia para las familias con los presupuestos de 2027.</td></tr>
<tr><td>Búsqueda objetivo</td><td>La consulta principal que debe responder la pieza.</td><td>presupuestos 2027 familias</td></tr>
<tr><td>Intención</td><td>Qué necesita el lector.</td><td>Entender cómo le afecta en su bolsillo.</td></tr>
<tr><td>Formato</td><td>Tipo de pieza y extensión orientativa.</td><td>Explicativo de 900 a 1.200 palabras con una tabla.</td></tr>
<tr><td>Fuentes</td><td>Documentos y personas imprescindibles.</td><td>Proyecto de ley, ministerio, dos expertos.</td></tr>
<tr><td>Piezas relacionadas</td><td>Contenido propio al que enlazar.</td><td>Guía de la declaración de la renta, pieza sobre el bono energético.</td></tr>
<tr><td>Destinos</td><td>Dónde y cómo se publica.</td><td>Web principal completa, web hermana resumida, hilo en X.</td></tr>
<tr><td>Fecha y prioridad</td><td>Cuándo tiene que estar lista.</td><td>Jueves a las 9:00, prioridad alta.</td></tr>
<tr><td>Responsables</td><td>Quién escribe, edita y aprueba.</td><td>Redacta Laura, edita Omar, aprueba la jefa de Economía.</td></tr>
</tbody>
</table>
<h3>Encargos que se reutilizan</h3>
<p>Muchas piezas siguen patrones repetidos: crónicas de partidos, resultados electorales, previsiones meteorológicas, guías de servicio, reseñas. Para esos formatos conviene tener plantillas de encargo con los campos ya rellenados en parte, de modo que el jefe de sección solo complete lo que cambia. Esto también facilita que la IA pueda proponer un primer borrador del encargo a partir de la propuesta, que una persona revisa y ajusta.</p>
<h3>El encargo vive con la pieza</h3>
<p>El encargo no debería quedarse en un correo o un documento aparte. Si vive dentro de la misma ficha que el borrador, el editor puede comprobar si el texto responde a lo que se pidió, el responsable de SEO ve la búsqueda objetivo sin preguntar y, meses después, quien actualice la pieza entiende por qué se escribió así.</p>

<h2 id="ia">Redacción con inteligencia artificial: dónde ayuda y dónde no</h2>
<p>La inteligencia artificial generativa puede ahorrar mucho tiempo en una redacción, pero también puede introducir errores difíciles de detectar si se usa sin un marco. La pregunta útil no es si usar IA, sino para qué tareas, con qué controles y quién responde del resultado.</p>
<h3>Tareas donde la IA suele aportar valor</h3>
<ul>
<li><strong>Investigación inicial:</strong> resumir documentos largos, como un proyecto de ley o un informe, para que el periodista sepa dónde mirar. El periodista sigue leyendo la fuente original para todo lo que cite.</li>
<li><strong>Propuestas de estructura:</strong> sugerir un esquema de apartados para un explicativo a partir del encargo.</li>
<li><strong>Titulares y meta descripciones:</strong> proponer varias opciones dentro de los límites de longitud para que el editor elija y ajuste.</li>
<li><strong>Adaptación a canales:</strong> convertir una pieza aprobada en un hilo, un carrusel o un texto para boletín, respetando el contenido verificado.</li>
<li><strong>Textos alternativos de imágenes:</strong> describir una imagen para que una persona revise y corrija la descripción.</li>
<li><strong>Revisión de estilo:</strong> detectar frases demasiado largas, repeticiones, voz pasiva excesiva o incumplimientos del libro de estilo.</li>
<li><strong>Traducción de trabajo:</strong> ofrecer una primera versión en otro idioma que un editor nativo revisa.</li>
</ul>
<h3>Tareas donde conviene no delegar</h3>
<ul>
<li><strong>Datos y citas:</strong> cualquier cifra, fecha, nombre o declaración debe comprobarse contra la fuente original. Los modelos generativos pueden producir datos plausibles pero falsos.</li>
<li><strong>Juicio editorial:</strong> decidir qué es noticia, qué enfoque es justo o qué se omite por respeto a las víctimas son decisiones que deben tomar personas.</li>
<li><strong>Temas sensibles:</strong> salud, justicia, menores, tragedias y procesos electorales requieren un cuidado que no se puede automatizar.</li>
<li><strong>Información no publicada:</strong> no se deben introducir en herramientas externas documentos confidenciales, datos personales de fuentes o exclusivas sin garantías claras sobre su tratamiento.</li>
</ul>
<h3>Reglas para un uso responsable</h3>
<ol>
<li>Define por escrito qué tareas están permitidas y cuáles no.</li>
<li>Toda pieza asistida por IA pasa por las mismas fases de edición y aprobación que cualquier otra.</li>
<li>El editor sabe qué partes se han generado o transformado con IA, aunque el lector no lo necesite saber en cada caso.</li>
<li>Las cifras y citas se verifican siempre contra la fuente original y la fuente se enlaza o se cita.</li>
<li>Si tu medio informa a los lectores sobre el uso de IA, la política es pública, concreta y se cumple.</li>
</ol>
<p>Los buscadores han dejado claro que lo que valoran es la utilidad y fiabilidad del contenido, no la herramienta con la que se ha producido. Un texto generado en masa sin revisión, que no aporta nada nuevo, tiene pocas posibilidades de rendir; un texto útil, verificado y firmado por un equipo que responde de él, sí. El flujo editorial es lo que garantiza que la IA sirva para lo segundo.</p>

<h2 id="edicion">Edición, verificación y estilo</h2>
<p>La edición es la fase donde un borrador se convierte en una pieza publicable. En muchos medios digitales se ha ido comprimiendo por la presión del volumen, y es precisamente ahí donde se cuelan la mayoría de errores que dañan la credibilidad.</p>
<h3>Qué revisa un editor</h3>
<ul>
<li><strong>Enfoque:</strong> si la pieza responde al encargo y a la intención del lector, y si el primer párrafo dice lo más importante.</li>
<li><strong>Estructura:</strong> si los apartados siguen un orden lógico, si los intertítulos describen su contenido y si la pieza se puede escanear.</li>
<li><strong>Datos:</strong> si las cifras, fechas y nombres son correctos y están atribuidos.</li>
<li><strong>Fuentes:</strong> si cada afirmación relevante tiene una fuente identificable y, cuando es posible, enlazada.</li>
<li><strong>Estilo:</strong> si cumple el libro de estilo del medio, si el tono es el adecuado y si se entiende a la primera.</li>
<li><strong>Riesgos:</strong> si hay afirmaciones que pueden ser difamatorias, datos personales innecesarios o imágenes con derechos dudosos.</li>
</ul>
<h3>Comentarios accionables</h3>
<p>Cuando el editor devuelve una pieza, los comentarios deben ser concretos y estar anclados al texto: «este dato necesita fuente», «el segundo apartado repite el primero», «falta explicar qué significa esta sigla». Los comentarios generales como «dale una vuelta» generan iteraciones innecesarias. Si los comentarios viven en la misma pieza, el redactor los resuelve uno a uno y el editor ve qué ha cambiado sin tener que releerlo todo.</p>
<h3>Versiones y trazabilidad</h3>
<p>Guardar las versiones de una pieza permite saber qué cambió entre el borrador y la versión publicada, quién lo cambió y por qué. Es útil para formar al equipo, para resolver discusiones y, sobre todo, cuando hay que corregir algo después de publicar. Las correcciones relevantes deberían quedar señaladas en la propia pieza para el lector, con la fecha y el motivo.</p>
<h3>Verificación de datos proporcional al riesgo</h3>
<p>No todas las piezas necesitan el mismo nivel de verificación. Una crónica deportiva con el resultado de un partido requiere menos comprobaciones que una investigación sobre contratos públicos. Definir niveles de verificación según el tipo de pieza, y que el nivel quede indicado en el encargo, ayuda a dedicar el tiempo donde más falta hace sin bloquear la producción diaria.</p>
`;
