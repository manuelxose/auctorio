// Parte 3 de la guía "Flujo de trabajo editorial" (secciones 13–17 y conclusión).
export const PART_3 = `
<h2 id="metricas">Métricas para medir un flujo editorial</h2>
<p>Lo que no se mide no se puede mejorar, pero medir lo equivocado es peor que no medir. Las métricas de un flujo editorial deben responder a dos preguntas: si el proceso funciona, es decir, si las piezas avanzan sin atascos ni errores, y si el resultado funciona, es decir, si las piezas cumplen su objetivo con los lectores.</p>
<h3>Métricas de proceso</h3>
<table>
<thead><tr><th>Métrica</th><th>Qué indica</th><th>Cómo se usa</th></tr></thead>
<tbody>
<tr><td>Tiempo de encargo a publicación</td><td>Cuánto tarda una pieza en recorrer el flujo.</td><td>Compararlo por formato y sección para detectar dónde se alarga.</td></tr>
<tr><td>Tiempo en cada fase</td><td>Dónde se acumulan las piezas.</td><td>Si las piezas pasan días en «lista para revisión», falta capacidad de aprobación.</td></tr>
<tr><td>Piezas devueltas en edición</td><td>Calidad de los encargos y de los borradores.</td><td>Muchas devoluciones suelen indicar encargos poco claros.</td></tr>
<tr><td>Comprobaciones fallidas antes de aprobar</td><td>Qué errores aparecen con más frecuencia.</td><td>Orientar la formación y ajustar plantillas.</td></tr>
<tr><td>Errores publicados</td><td>Fallos que llegan al lector.</td><td>Revisar la lista de control y el flujo cuando aparecen.</td></tr>
<tr><td>Publicaciones fallidas por destino</td><td>Fiabilidad de las integraciones.</td><td>Detectar credenciales caducadas o canales problemáticos.</td></tr>
<tr><td>Piezas atemporales revisadas a tiempo</td><td>Salud del archivo.</td><td>Planificar la capacidad dedicada a actualizar.</td></tr>
</tbody>
</table>
<h3>Métricas de resultado</h3>
<ul>
<li><strong>Visibilidad en buscadores:</strong> impresiones, clics y posición media de cada pieza para su búsqueda objetivo. Compara la búsqueda que se planificó en el encargo con las búsquedas que realmente traen tráfico.</li>
<li><strong>Atención:</strong> tiempo de lectura activo y profundidad de desplazamiento, mejor que las páginas vistas por sí solas.</li>
<li><strong>Recurrencia:</strong> si los lectores vuelven, se suscriben al boletín o, si el medio tiene modelo de pago, se registran o suscriben.</li>
<li><strong>Rendimiento por canal:</strong> qué destinos aportan más audiencia y de qué calidad.</li>
<li><strong>Vida útil:</strong> cuánto tráfico sigue recibiendo una pieza semanas o meses después de publicarse.</li>
</ul>
<h3>Evita las métricas vanidosas</h3>
<p>El número de piezas publicadas al día es fácil de medir y tentador de maximizar, pero por sí solo no dice nada bueno. Un aumento de volumen que no se traduce en más atención, más visibilidad o más lectores recurrentes suele significar que se están publicando piezas que compiten entre sí o que no aportan nada. Es más útil seguir cuántas piezas superan un umbral razonable de atención o de visibilidad que cuántas se publican.</p>
<h3>Revisiones periódicas</h3>
<p>Las métricas sirven si alguien las mira con regularidad y toma decisiones. Una reunión breve cada semana para revisar las métricas de proceso, y otra cada mes para las de resultado, suele bastar. La pregunta que debe guiar ambas no es «¿quién ha fallado?», sino «¿qué parte del flujo podemos mejorar?».</p>

<h2 id="herramientas">Herramientas: cómo elegir software de flujo editorial</h2>
<p>Un flujo editorial se puede empezar con una hoja de cálculo, un tablero de tareas y mucha disciplina. Muchas redacciones lo hacen así durante años. El problema aparece cuando el volumen crece: la información se reparte entre el tablero, el CMS, el chat, el correo y varias herramientas de SEO, y mantenerlo todo sincronizado se convierte en un trabajo en sí mismo.</p>
<h3>Qué debería resolver una herramienta</h3>
<ul>
<li><strong>Una ficha única por pieza:</strong> encargo, borrador, comentarios, imágenes, versiones, comprobaciones y publicaciones en el mismo lugar.</li>
<li><strong>Estados configurables:</strong> las fases y los responsables de tu redacción, no un flujo genérico.</li>
<li><strong>Planificación con datos:</strong> ayuda para decidir qué cubrir a partir de la demanda de búsqueda y de tu propio archivo.</li>
<li><strong>Comprobaciones automáticas:</strong> la parte mecánica de la lista de control, visible en el momento de aprobar.</li>
<li><strong>Aprobación registrada:</strong> quién aprobó, cuándo y qué versión.</li>
<li><strong>Publicación en varios destinos:</strong> conexión con tus CMS y canales, con reglas por destino, reintentos y avisos.</li>
<li><strong>Calendario común:</strong> todas las salidas programadas de todas las webs y canales.</li>
<li><strong>Historial:</strong> qué se publicó, dónde, cuándo y con qué resultado.</li>
</ul>
<h3>Preguntas que conviene hacer antes de elegir</h3>
<ol>
<li>¿Se integra con el CMS que ya usamos o nos obliga a cambiarlo?</li>
<li>¿Puede gestionar varias webs con reglas distintas desde el mismo espacio?</li>
<li>¿Cómo usa la inteligencia artificial y qué control humano mantiene antes de publicar?</li>
<li>¿Dónde se procesan nuestros datos y los de nuestras fuentes?</li>
<li>¿Qué ocurre cuando una publicación falla?</li>
<li>¿Podemos exportar nuestro contenido y nuestro historial si dejamos de usarla?</li>
<li>¿Cuánto tiempo necesita el equipo para empezar a usarla en el día a día?</li>
</ol>
<h3>CMS, herramientas de tareas y plataformas editoriales</h3>
<p>Hay tres grandes enfoques. El primero es extender el CMS con complementos de flujo y SEO: funciona bien con una sola web, pero se complica con varias. El segundo es combinar una herramienta de gestión de tareas genérica con el CMS: es flexible, pero la información queda partida y la sincronización es manual. El tercero es usar una plataforma de flujo editorial que se sitúa por encima de uno o varios CMS y canales y concentra la planificación, la producción, la revisión y la publicación. Es el enfoque de herramientas como Auctorio, pensado para equipos que publican en varias webs y redes y quieren que el SEO y la IA formen parte del proceso con aprobación humana obligatoria.</p>
<p>Ninguna herramienta arregla un flujo que no está definido. Lo recomendable es diseñar primero el proceso, aunque sea en papel, y elegir después la herramienta que mejor lo soporte, no al revés.</p>

<h2 id="errores">Errores frecuentes al diseñar un flujo editorial</h2>
<h3>1. Copiar el flujo de otro medio</h3>
<p>El flujo de un diario nacional con doscientas personas no sirve para una web temática con seis. Inspírate en otros, pero diseña a partir de tus formatos, tu volumen y tu equipo.</p>
<h3>2. Demasiadas fases</h3>
<p>Cada fase añade un movimiento y un posible atasco. Si una fase no tiene un criterio de paso claro ni un responsable distinto de la anterior, probablemente sobra.</p>
<h3>3. Aprobaciones colectivas</h3>
<p>«Lo revisa el equipo» significa que no lo revisa nadie en concreto. Cada aprobación necesita una persona, con un suplente definido para ausencias.</p>
<h3>4. SEO al final</h3>
<p>Revisar el SEO cuando la pieza ya está escrita, o peor, publicada, obliga a rehacer trabajo. Repartirlo entre planificación, encargo y preparación es más eficaz y menos costoso.</p>
<h3>5. Información fuera de la pieza</h3>
<p>Si el encargo está en un correo, los comentarios en el chat y las imágenes en una carpeta compartida, nadie tiene la imagen completa. Todo lo que afecta a una pieza debería vivir con la pieza.</p>
<h3>6. Ignorar las urgencias</h3>
<p>Un flujo que solo funciona para piezas planificadas se saltará en cuanto llegue una última hora, y una vez que se salta, se salta siempre. Diseña desde el principio una ruta rápida para urgencias con los controles mínimos imprescindibles.</p>
<h3>7. Automatizar sin supervisión</h3>
<p>Automatizar comprobaciones y tareas repetitivas es positivo; automatizar la decisión de publicar no lo es. La IA y las reglas automáticas deben preparar el trabajo, no sustituir el juicio editorial.</p>
<h3>8. No medir el propio proceso</h3>
<p>Muchas redacciones miden obsesivamente la audiencia y nunca el proceso que la produce. Sin datos sobre tiempos, devoluciones y errores, las mejoras del flujo se basan en impresiones.</p>
<h3>9. Olvidar el archivo</h3>
<p>Un flujo que solo contempla piezas nuevas deja que el archivo se degrade. Reserva capacidad para actualizar, fusionar y retirar contenidos.</p>
<h3>10. Implantarlo todo de golpe</h3>
<p>Cambiar todas las fases, herramientas y responsabilidades a la vez genera rechazo. Es mejor empezar por un formato o una sección, aprender y extender.</p>

<h2 id="plan-30-dias">Cómo implantar un flujo editorial en 30 días</h2>
<p>Implantar un flujo editorial no requiere meses de consultoría. Con un plan claro y el compromiso de la dirección, se puede tener un primer flujo funcionando en cuatro semanas y mejorarlo después con datos.</p>
<h3>Semana 1: entender cómo se trabaja hoy</h3>
<ul>
<li>Elige tres piezas recientes de formatos distintos y reconstruye su recorrido: quién propuso el tema, quién lo encargó, cuántas versiones hubo, quién aprobó y dónde se publicó.</li>
<li>Entrevista brevemente a un periodista, un editor, la persona de SEO y la de redes. Pregunta dónde pierden más tiempo y qué errores se repiten.</li>
<li>Haz un inventario de herramientas, webs y canales.</li>
<li>Recoge los errores publicados en los últimos tres meses.</li>
</ul>
<h3>Semana 2: diseñar el flujo</h3>
<ul>
<li>Define las fases, con nombres claros y un criterio de paso para cada una.</li>
<li>Asigna responsables con una matriz sencilla y un único aprobador por fase.</li>
<li>Escribe la plantilla de encargo y la lista de control previa a publicar, empezando por los errores reales que recogiste.</li>
<li>Define la ruta rápida para urgencias.</li>
<li>Decide las reglas por destino para cada web y canal.</li>
</ul>
<h3>Semana 3: probar con una sección</h3>
<ul>
<li>Aplica el flujo en una sola sección o formato durante una semana completa.</li>
<li>Usa la herramienta que vayas a mantener, aunque sea provisional, para que la prueba sea realista.</li>
<li>Recoge cada fricción: fases que nadie entiende, puntos de la lista que no aportan, aprobaciones que se atascan.</li>
<li>Ajusta sobre la marcha y documenta los cambios.</li>
</ul>
<h3>Semana 4: extender y medir</h3>
<ul>
<li>Extiende el flujo al resto de secciones con una formación breve y práctica, mejor con piezas reales que con presentaciones.</li>
<li>Activa las métricas de proceso básicas: tiempo de encargo a publicación, tiempo por fase, devoluciones y errores publicados.</li>
<li>Programa la primera revisión mensual del flujo.</li>
<li>Asigna una persona responsable de mantener el flujo, la plantilla y la lista de control.</li>
</ul>
<aside class="callout"><p><strong>Señal de éxito:</strong> al final del primer mes, cualquier persona de la redacción debería poder decir en qué estado está cualquier pieza, qué le falta y quién tiene que hacerlo, sin preguntar a nadie.</p></aside>

<h2 id="conclusion">Conclusión</h2>
<p>Un flujo de trabajo editorial no es un fin en sí mismo. Es la forma de que una redacción dedique su energía a lo que importa, que es contar bien historias útiles y fiables, en lugar de a coordinarse, perseguir aprobaciones o corregir errores evitables. Los medios que publican con más calidad y más alcance no son necesariamente los que tienen más personas, sino los que han convertido sus buenas prácticas en un proceso compartido.</p>
<p>Los principios son sencillos: fases claras con un responsable cada una, un encargo que viaja con la pieza, el SEO repartido a lo largo del proceso, la IA como ayuda y no como sustituto del juicio editorial, una lista de control corta y en parte automática, una aprobación humana registrada, una publicación multicanal que se apoya en una única versión de referencia, un archivo que se mantiene vivo y unas métricas que miden tanto el resultado como el proceso.</p>
<p>Empieza por lo que más duele hoy. Si los errores publicados son el problema, empieza por la lista de control. Si el problema es que nadie sabe en qué estado está cada pieza, empieza por las fases. Si el problema es el SEO, empieza por el encargo. Cada mejora hace más fácil la siguiente.</p>
<p>Si quieres ver cómo se aplica todo esto en una herramienta, Auctorio reúne la planificación por demanda de búsqueda, la redacción asistida, la revisión con comprobaciones previas, la aprobación humana y la publicación en varias webs y redes en un único espacio de trabajo.</p>
`;

export const FAQ = [
  {
    question: '¿Qué es un flujo de trabajo editorial?',
    answer:
      'Es la secuencia acordada de fases, responsables y criterios por la que pasa una pieza desde la propuesta del tema hasta su publicación, distribución y actualización. Define quién hace qué, cuándo y qué tiene que cumplirse para avanzar.',
  },
  {
    question: '¿Cuántas fases debe tener un flujo editorial?',
    answer:
      'No hay un número fijo. Para la mayoría de medios digitales funcionan entre ocho y diez fases agrupadas en planificar, producir, aprobar y publicar. Cada fase necesita un criterio de paso claro y un responsable; si no los tiene, probablemente sobra.',
  },
  {
    question: '¿Quién debe aprobar una pieza antes de publicarla?',
    answer:
      'Una persona concreta con autoridad editorial, normalmente un editor o jefe de sección, distinta de quien la ha escrito. La aprobación debe quedar registrada con nombre y hora, también cuando la pieza se ha preparado con ayuda de inteligencia artificial.',
  },
  {
    question: '¿Dónde encaja el SEO en el flujo editorial?',
    answer:
      'En varias fases: al planificar se elige la búsqueda objetivo y se comprueba si ya existe una pieza propia; en el encargo se indican las preguntas y enlaces relacionados; al preparar la pieza se revisan título, meta descripción, imagen, enlazado y datos estructurados; y tras publicar se mide el resultado.',
  },
  {
    question: '¿Se puede usar inteligencia artificial en una redacción sin perder calidad?',
    answer:
      'Sí, si tiene un lugar definido en el flujo. Es útil para resumir documentos, proponer estructuras, titulares y textos alternativos o adaptar piezas a otros canales, siempre con verificación de datos contra la fuente original y aprobación humana antes de publicar.',
  },
  {
    question: '¿Qué debe incluir una lista de control previa a la publicación?',
    answer:
      'Entre ocho y quince puntos verificables: que el primer párrafo responda a la pregunta principal, que las cifras tengan fuente, la longitud del título y la meta descripción, la imagen con derechos y texto alternativo, los enlaces internos, los datos estructurados válidos, la autoría y la revisión del editor.',
  },
  {
    question: '¿Cómo se gestiona la publicación en varias webs?',
    answer:
      'Manteniendo una única versión aprobada de la pieza y derivando de ella las versiones para cada destino, con reglas por web y canal, etiqueta canónica cuando los textos son casi idénticos, reintentos automáticos si una publicación falla y un registro de dónde se ha publicado cada pieza.',
  },
  {
    question: '¿Cuánto se tarda en implantar un flujo editorial?',
    answer:
      'Un primer flujo puede estar funcionando en unas cuatro semanas: una para entender cómo se trabaja hoy, otra para diseñar fases, responsables, encargo y lista de control, otra para probarlo en una sección y una última para extenderlo y empezar a medirlo.',
  },
] as const;
