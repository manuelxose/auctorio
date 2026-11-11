// Parte 4 de la guía "Flujo de trabajo editorial": formatos, gobernanza, accesibilidad y caso práctico.
export const PART_4 = `
<h2 id="formatos">Un flujo, varios formatos</h2>
<p>Un error habitual es diseñar el flujo pensando en un solo tipo de pieza, normalmente el artículo estándar, y descubrir después que no encaja con el resto. La solución no es crear un flujo distinto para cada formato, sino mantener las mismas fases y ajustar para cada formato la plantilla de encargo, la lista de control y el nivel de verificación.</p>
<h3>Última hora</h3>
<p>La última hora necesita velocidad sin renunciar a la responsabilidad. Lo habitual es una ruta rápida en la que el jefe de sección o el editor de guardia puede encargar, editar y aprobar en el mismo paso, con una lista de control reducida a lo imprescindible: dato confirmado por al menos una fuente fiable, título claro, imagen con derechos o ninguna imagen, y la marca de que la pieza se ampliará. A partir de ahí, la pieza entra en el flujo normal para su ampliación y su versión definitiva, que sí pasa todas las comprobaciones.</p>
<h3>Directos</h3>
<p>Los directos son piezas vivas que se actualizan durante horas. El flujo debe permitir que varias personas añadan entradas, que un editor revise cada una antes de publicarla o inmediatamente después según el riesgo, y que el resumen inicial se mantenga actualizado con lo más importante. Al terminar, conviene convertir el directo en una pieza de resumen o enlazarlo desde una pieza estable, porque los directos suelen perder valor de búsqueda en cuanto termina el evento.</p>
<h3>Explicativos y guías de servicio</h3>
<p>Son las piezas con más vida útil y las que más se benefician del SEO editorial. Necesitan un encargo detallado con la búsqueda objetivo y las preguntas relacionadas, una edición cuidadosa de la estructura, datos estructurados correctos y una fecha de revisión asignada desde el principio. En este formato tiene especial sentido usar tablas, listas y apartados de preguntas frecuentes cuando responden a dudas reales del lector.</p>
<h3>Reportajes e investigaciones</h3>
<p>Los reportajes tienen ciclos largos, más personas implicadas y más riesgo legal. El flujo es el mismo, pero con hitos intermedios dentro de la fase de redacción, revisión legal cuando corresponde y un nivel de verificación más alto. La planificación de la distribución empieza antes de terminar el texto: qué piezas derivadas se van a publicar, en qué canales y en qué orden.</p>
<h3>Boletines</h3>
<p>Un boletín es a la vez un destino de publicación y una pieza propia. Si se trata como destino, las piezas aprobadas alimentan el boletín con un resumen y un enlace. Si tiene contenido original, necesita su propio encargo, edición y aprobación. En ambos casos conviene que el calendario de publicación muestre los boletines junto al resto de salidas para evitar que una pieza se anuncie antes de estar publicada.</p>
<h3>Piezas visuales y de datos</h3>
<p>Gráficos, mapas y visualizaciones requieren que la fase de redacción incluya la preparación y verificación de los datos, y que la lista de control compruebe que los gráficos tienen título, fuente, unidades y una descripción textual para quien no puede verlos. Es un formato donde los errores son especialmente visibles y se comparten mucho, así que merece un nivel de verificación alto aunque la pieza sea corta.</p>
<table>
<thead><tr><th>Formato</th><th>Verificación</th><th>Lista de control</th><th>Revisión posterior</th></tr></thead>
<tbody>
<tr><td>Última hora</td><td>Mínima confirmada</td><td>Reducida</td><td>Ampliación en horas</td></tr>
<tr><td>Directo</td><td>Por entrada</td><td>Por entrada y resumen</td><td>Pieza de resumen al cerrar</td></tr>
<tr><td>Explicativo o guía</td><td>Alta</td><td>Completa con SEO</td><td>Fecha de revisión periódica</td></tr>
<tr><td>Reportaje</td><td>Muy alta y legal</td><td>Completa</td><td>Seguimiento de reacciones</td></tr>
<tr><td>Boletín</td><td>La de sus piezas</td><td>Enlaces y horario</td><td>Métricas de apertura y clic</td></tr>
<tr><td>Datos y gráficos</td><td>Alta sobre los datos</td><td>Título, fuente, descripción</td><td>Actualización de datos</td></tr>
</tbody>
</table>

<h2 id="gobernanza">Gobernanza: estilo, correcciones y política de IA</h2>
<p>Un flujo editorial se apoya en tres documentos que conviene tener escritos, accesibles y actualizados. No necesitan ser largos; necesitan ser concretos y conocidos por todo el equipo.</p>
<h3>Libro de estilo</h3>
<p>Define cómo se escribe en el medio: tratamiento de cifras, fechas, nombres propios, siglas, tono, uso de anglicismos, criterios para titulares y para intertítulos. Para que sea útil dentro del flujo, conviene convertir sus reglas más importantes en comprobaciones que se puedan revisar automáticamente o de un vistazo, y enlazarlo desde la ficha de cada pieza.</p>
<h3>Política de correcciones</h3>
<p>Explica qué se hace cuando se detecta un error después de publicar: quién decide si es una corrección relevante, cómo se señala al lector, si se mantiene un registro público de correcciones y cómo se propagan a los demás destinos donde se publicó la pieza. Tener esta política escrita evita improvisar en el peor momento y demuestra al lector que el medio responde de lo que publica.</p>
<h3>Política de uso de inteligencia artificial</h3>
<p>Debe concretar qué tareas pueden asistirse con IA, cuáles están excluidas, qué herramientas están aprobadas, qué datos no pueden introducirse en ellas, cómo se verifica el resultado y, si el medio lo decide, cómo se informa al lector. Conviene revisarla cada pocos meses, porque las herramientas y las prácticas cambian rápido, y asegurarse de que el flujo la hace cumplir en lugar de depender solo de la buena voluntad.</p>
<h3>Quién mantiene los documentos</h3>
<p>Cada documento necesita un responsable y una fecha de revisión. Un libro de estilo que nadie actualiza desde hace años o una política de IA escrita antes de que el equipo empezara a usar las herramientas actuales generan más confusión que ayuda.</p>

<h2 id="accesibilidad">Accesibilidad y obligaciones legales</h2>
<p>La accesibilidad y el cumplimiento legal suelen tratarse como asuntos técnicos o jurídicos, pero muchas de sus exigencias se cumplen o se incumplen dentro del flujo editorial, pieza a pieza.</p>
<h3>Accesibilidad editorial</h3>
<ul>
<li><strong>Textos alternativos</strong> que describen las imágenes informativas y vacíos para las decorativas.</li>
<li><strong>Intertítulos jerárquicos</strong> que permiten navegar la pieza con un lector de pantalla.</li>
<li><strong>Enlaces descriptivos</strong> en lugar de «pincha aquí».</li>
<li><strong>Descripción textual de gráficos</strong> y tablas con encabezados.</li>
<li><strong>Subtítulos o transcripciones</strong> para vídeos y audios.</li>
<li><strong>Lenguaje claro</strong> y frases de longitud razonable, que benefician a todos los lectores.</li>
</ul>
<p>La mayoría de estos puntos pueden formar parte de la lista de control previa a la publicación, y varios se pueden comprobar automáticamente.</p>
<h3>Derechos de imagen y contenido de terceros</h3>
<p>Cada imagen, vídeo o gráfico debe tener su origen y sus derechos de uso registrados con la pieza. Es especialmente importante cuando el mismo recurso se reutiliza en varias webs o en redes sociales, porque una licencia puede cubrir un uso y no otro.</p>
<h3>Datos personales</h3>
<p>Las piezas que incluyen datos personales de particulares, menores o víctimas requieren un criterio claro sobre qué se publica y qué no. El flujo puede marcar estas piezas para que pasen por una revisión adicional, y la política de IA debe impedir que esos datos se introduzcan en herramientas externas sin garantías.</p>
<h3>Contenido patrocinado</h3>
<p>Cuando una pieza es publicidad o está patrocinada, debe identificarse claramente como tal para el lector y, en los enlaces, con los atributos adecuados para los buscadores. El flujo debería tener un tipo de pieza específico para este contenido, con su propia aprobación y su propia marca visible.</p>

<h2 id="caso-practico">Caso práctico: un día en una redacción con flujo definido</h2>
<p>Para ver cómo encaja todo, sigamos un día ficticio pero realista en un medio regional con tres webs —la cabecera principal, una web de servicios y una web deportiva— y presencia en dos redes sociales.</p>
<h3>8:00, planificación</h3>
<p>La jefa de Economía abre el plan editorial. El sistema ha detectado que las búsquedas sobre los presupuestos regionales han crecido mucho desde la tarde anterior, que el medio no tiene ninguna pieza que explique cómo afectan a las familias y que la guía de ayudas al alquiler tiene catorce meses. En la reunión de las 8:15 se aceptan dos propuestas: un explicativo sobre los presupuestos y la actualización de la guía de ayudas.</p>
<h3>8:30, encargo</h3>
<p>El explicativo se encarga a Laura con la búsqueda objetivo, tres preguntas relacionadas que conviene responder, enlaces a dos piezas propias, destinos —completo en la cabecera, versión corta en la web de servicios, hilo en una red social— y aprobación a cargo de la jefa de sección. La actualización de la guía se asigna a Ana con una lista de los datos que hay que revisar.</p>
<h3>9:00 a 11:00, redacción</h3>
<p>Laura usa un resumen asistido del proyecto de presupuestos para localizar las partidas relevantes y lee el documento original para todo lo que cita. Escribe directamente en la ficha de la pieza, donde ya tiene el encargo, y adjunta las fuentes y una imagen de archivo con derechos. Pide al sistema tres propuestas de título SEO y elige una que ajusta a mano.</p>
<h3>11:00, edición</h3>
<p>Omar edita la pieza. Deja dos comentarios anclados al texto: una cifra sin fuente y un apartado que repite el anterior. Laura los resuelve en quince minutos. Omar comprueba la estructura, ajusta el primer párrafo y marca la pieza como lista para revisión.</p>
<h3>11:30, comprobaciones y aprobación</h3>
<p>La jefa de sección abre la pieza y ve junto al texto el resultado de las comprobaciones: título de 54 caracteres, meta descripción correcta, datos estructurados válidos, imagen con texto alternativo y tres fuentes enlazadas. Hay un aviso: falta un enlace interno a la pieza del año anterior. Lo añade y aprueba. La aprobación queda registrada con su nombre.</p>
<h3>12:00, publicación</h3>
<p>La pieza sale en la cabecera a las 12:00, la versión corta en la web de servicios a las 12:10 y el hilo a las 12:30, que es la hora en que esa red tiene más audiencia para el medio. La publicación en la web de servicios falla porque la contraseña de aplicación ha caducado; el sistema reintenta, avisa a la persona responsable de la integración, que renueva la credencial, y la pieza se publica a las 12:25. La ficha muestra en todo momento qué destinos están publicados.</p>
<h3>17:00, última hora</h3>
<p>Llega una noticia urgente sobre un accidente en una autovía. El editor de guardia usa la ruta rápida: encarga, edita y aprueba una pieza de cuatro líneas con el dato confirmado por la fuente oficial, sin imagen, marcada para ampliar. Una hora después, la ampliación pasa por el flujo completo.</p>
<h3>Al día siguiente, medición</h3>
<p>En la revisión semanal, el equipo ve que el explicativo aparece en las primeras posiciones para su búsqueda objetivo y para dos de las preguntas relacionadas, que el tiempo de lectura es alto y que el hilo ha llevado tráfico a la web de servicios. También ve que la guía de ayudas actualizada ha recuperado visibilidad. La fecha de revisión de la guía se fija para dentro de seis meses.</p>
<p>Ninguno de estos pasos es extraordinario. Lo que cambia respecto a una redacción sin flujo es que nadie ha tenido que preguntar en qué estado estaba una pieza, que los errores se han detectado antes de publicar, que el fallo de publicación se ha resuelto en minutos y no en días, y que las decisiones del día siguiente se basan en datos.</p>

<h2 id="glosario">Glosario del flujo editorial</h2>
<dl>
<dt>Aprobación</dt><dd>Decisión registrada de una persona con autoridad editorial que permite publicar una pieza. Incluye quién aprobó, cuándo y qué versión.</dd>
<dt>Búsqueda objetivo</dt><dd>Consulta principal que una pieza pretende responder en los buscadores. Se decide al planificar y se anota en el encargo.</dd>
<dt>Canibalización</dt><dd>Situación en la que varias piezas del mismo medio compiten por la misma búsqueda, repartiendo la visibilidad entre ellas. Se resuelve fusionando o diferenciando las piezas.</dd>
<dt>Cluster temático</dt><dd>Grupo de piezas relacionadas, con una pieza principal y varias satélite enlazadas entre sí, que cubren un tema en profundidad.</dd>
<dt>Contenido atemporal</dt><dd>Pieza que sigue siendo útil mucho tiempo después de publicarse, como una guía o un explicativo. Requiere revisiones periódicas.</dd>
<dt>Criterio de paso</dt><dd>Condición que debe cumplirse para que una pieza avance de una fase a la siguiente del flujo.</dd>
<dt>Datos estructurados</dt><dd>Marcado en el código de la página que describe su contenido a los buscadores: tipo de pieza, titular, imagen, fechas, autoría o preguntas frecuentes.</dd>
<dt>Destino</dt><dd>Cada lugar donde se publica una pieza: una web, un boletín, una red social o el feed de un socio, con sus propias reglas de formato y horario.</dd>
<dt>Encargo</dt><dd>Documento que define una pieza antes de escribirla: tema, enfoque, búsqueda objetivo, formato, fuentes, destinos, fecha y responsables.</dd>
<dt>Etiqueta canónica</dt><dd>Indicación a los buscadores de cuál es la versión principal de un contenido que se publica en varias URL.</dd>
<dt>Lista de control previa</dt><dd>Conjunto corto de comprobaciones verificables que una pieza debe superar antes de ser aprobada. Parte de ellas pueden automatizarse.</dd>
<dt>Meta descripción</dt><dd>Resumen breve de la pieza que los buscadores pueden mostrar bajo el título en sus resultados.</dd>
<dt>Ruta rápida</dt><dd>Versión abreviada del flujo para piezas urgentes, con los controles mínimos imprescindibles y la misma exigencia de aprobación humana.</dd>
<dt>Texto alternativo</dt><dd>Descripción textual de una imagen para personas que no pueden verla y para los casos en que la imagen no carga.</dd>
<dt>Versión de referencia</dt><dd>Versión aprobada de una pieza de la que se derivan las versiones para cada destino. Las correcciones se hacen sobre ella.</dd>
</dl>
`;
