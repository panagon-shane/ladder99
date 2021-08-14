<?xml version="1.0" encoding="UTF-8"?>

<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:xs="http://www.w3.org/2001/XMLSchema"
	xmlns:fn="http://www.w3.org/2005/xpath-functions"
	xmlns:m="urn:mtconnect.org:MTConnectDevices:1.7"
	xmlns:s="urn:mtconnect.org:MTConnectStreams:1.7"
	xmlns:js="urn:custom-javascript" exclude-result-prefixes="msxsl js"
	xmlns:msxsl="urn:schemas-microsoft-com:xslt">

	<xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

	<!-- Root template -->
	<xsl:template match="/">

		<head>
			<meta charset="utf-8"></meta>
			<meta http-equiv="X-UA-Compatible" content="IE=edge"></meta>
			<meta name="viewport" content="width=device-width, initial-scale=1"></meta>
			<title>Ladder99 Agent</title>
			<link href="/styles/bootstrap.min.css" rel="stylesheet"></link>
			<link href="/styles/styles.css" rel="stylesheet"></link>
		</head>

		<body>
			<!-- <nav class="navbar navbar-default navbar-fixed-top"> -->
			<nav class="navbar navbar-inverse navbar-fixed-top">
				<div class="container-fluid">

					<!-- brand and toggle get grouped for better mobile display -->
					<div class="navbar-header">
						<button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1" aria-expanded="false">
							<span class="sr-only">Toggle navigation</span>
							<span class="icon-bar"></span>
							<span class="icon-bar"></span>
							<span class="icon-bar"></span>
						</button>
						<a class="navbar-brand" style="padding: 5px 10px;" href="#">
							<img alt="Brand" src="/styles/LogoLadder99-text.png" height="40"/>
						</a>
					</div>

					<!-- collect the nav links, forms, and other content for toggling -->
					<div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">
						<ul class="nav navbar-nav">
							<li>
								<a href="../probe">Probe</a>
							</li>
							<li>
								<a href="../current">Current</a>
							</li>
							<li>
								<a href="../sample">Sample</a>
							</li>
						</ul>
						<div class="navbar-form navbar-left">
							<div class="form-group">
								<input id="fromText" type="text" class="form-control" style="width: 6em; margin-right: 10px;" placeholder="From"/>
								<input id="countText" type="text" class="form-control" style="width: 6em; margin-right: 10px;" placeholder="Count"/>
								<input id="queryText" type="text" class="form-control" style="margin-right: 10px;" placeholder="Query"/>
								<!-- <button onclick="showHelp()" class="btn btn-default">?</button> -->
								<!-- <button type="button" class="btn btn-default" data-bs-toggle="modal" data-bs-target="#exampleModal">?</button> -->
								<button type="button" class="btn btn-default" data-toggle="modal" data-target="#myModal">?</button>
							</div>
							<button onclick="getSample()" class="btn btn-default">Get Sample</button>
						</div>
					</div>

				</div>
			</nav>


			<div class="container-fluid page-container">
				<!-- <xsl:apply-templates select="/m:MTConnectDevices/m:Header" /> -->
				<!-- <xsl:apply-templates select="/s:MTConnectStreams/s:Header" /> -->
				<!-- <xsl:apply-templates select="/m:MTConnectDevices" /> -->
				<!-- <xsl:apply-templates select="*" /> -->
				<xsl:apply-templates />
				<xsl:apply-templates select="/s:MTConnectStreams" />
			</div>

			<!-- Modal -->
			<div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel">
				<div class="modal-dialog modal-dialog-centered" role="document">
					<div class="modal-content">
						<div class="modal-header">
							<button type="button" class="close" data-dismiss="modal" aria-label="Close">
								<span aria-hidden="true">x</span>
							</button>
							<h4 class="modal-title" id="myModalLabel">Help</h4>
						</div>
						<div class="modal-body">
							<h4>Ladder99 Agent</h4>

The Ladder99 Agent ...

						</div>
						<div class="modal-footer">
							<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
						</div>
					</div>
				</div>
			</div>

			<!-- jquery is needed for bootstrap modal -->
			<script src="/styles/jquery-1.12.4.min.js"></script>
			<!-- ...download this? -->
			<script src="https://kit.fontawesome.com/1dd18af014.js" crossorigin="anonymous"></script>
			<script src="/styles/bootstrap.min.js"></script>
			<script src="/styles/script.js"></script>

		</body>
	</xsl:template>

	<!-- Header template -->
	<xsl:template match="m:Header|s:Header">
		<details style="margin-bottom: 5px;">
			<summary style="font-size:medium;">
				<b>Header</b>
			</summary>
			<table class="table table-hover">
				<thead>
					<xsl:for-each select="@*">
						<th>
							<xsl:value-of select="name()"/>
						</th>
					</xsl:for-each>
				</thead>
				<tbody>
					<tr>
						<xsl:for-each select="@*">
							<td>
								<xsl:value-of select="."/>
							</td>
						</xsl:for-each>
					</tr>
				</tbody>
			</table>
		</details>
	</xsl:template>

	<!-- Probe template -->
	<xsl:template match="m:MTConnectDevices">
		<div class="table-responsive stickytable-container">
			<table class="table table-hover">
				<!-- <table class="table"> -->
				<thead>
					<th>Element</th>
					<th>Id</th>
					<th>Name</th>
					<th>Category</th>
					<th>Type</th>
					<th>SubType</th>
				</thead>
				<tbody>
					<xsl:for-each select="//*">
						<!-- <xsl:for-each select="//*[local-name(.) != 'Agent']"> -->
						<!-- <xsl:for-each select="*[local-name(.) != 'Agent']//*"> -->
						<!-- <xsl:for-each select="*[local-name(.) != 'Agent']/descendent-or-self::node()"> -->
						<xsl:variable name="indent" select="count(ancestor::*)" />
						<xsl:variable name="element" select="local-name()"/>

						<!-- <xsl:variable name="isDevice" select="local-name(.)='Device'" /> -->
						<!-- <xsl:variable name="isDataItem" select="local-name(.)='DataItem'" /> -->
						<tr>

							<td>
								<!-- indent according to depth and show type, eg Device, DataItem -->
								<span style="color:white">
									<xsl:value-of select="substring('xxxxxxxxxxxx',1,$indent)"/>
								</span>

								<!-- add +/- if item has any child elements -->
								<xsl:choose>
									<xsl:when test="*">
										<i class="far fa-plus-square" style="color:#aaa"></i>
									</xsl:when>
									<xsl:otherwise>
										&#8198;
									</xsl:otherwise>
								</xsl:choose>

								<!-- narrow space - see https://stackoverflow.com/questions/8515365/are-there-other-whitespace-codes-like-nbsp-for-half-spaces-em-spaces-en-space -->
								<!-- <span style="color:white">.</span> -->
								<!-- &#160; -->
								<!-- &#8239; -->
								&#8198;
																																																																																																																																																																																																																																																																																																																																																																																																																																	<!-- <xsl:value-of select="local-name()"/> -->
								<xsl:value-of select="$element" />
							</td>

							<td>
								<xsl:value-of select="@id"/>
							</td>
							<td>
								<xsl:value-of select="@name"/>
							</td>
							<td>
								<xsl:value-of select="@category"/>
							</td>
							<td>
								<xsl:value-of select="@type"/>
							</td>
							<td>
								<xsl:value-of select="@subType"/>
							</td>
						</tr>
					</xsl:for-each>
				</tbody>
			</table>
		</div>
	</xsl:template>

	<!-- Current/Sample template -->
	<xsl:template match="s:MTConnectStreams">
		<div class="table-responsive stickytable-container">
			<table class="table table-hover">
				<!-- <table class="table"> -->
				<thead>
					<th>Element</th>
					<th>Id</th>
					<th>Name</th>
					<th>Timestamp</th>
					<th>Sequence</th>
					<th>Value</th>
				</thead>
				<tbody>
					<xsl:for-each select="//*">
						<xsl:variable name="indent" select="count(ancestor::*)" />

						<!-- get style for the row -->
						<!-- so verbose... -->
						<xsl:variable name="weight">
							<xsl:choose>
								<!-- <xsl:when test="$indent=1"> -->
								<xsl:when test="local-name()='DeviceStream'">bold</xsl:when>
								<xsl:when test="local-name()='Samples'">bold</xsl:when>
								<xsl:when test="local-name()='Events'">bold</xsl:when>
								<xsl:when test="local-name()='Condition'">bold</xsl:when>
								<xsl:otherwise>normal</xsl:otherwise>
							</xsl:choose>
						</xsl:variable>

						<!-- get element name -->
						<xsl:variable name="element">
							<xsl:choose>
								<xsl:when test="local-name()='Condition'">Conditions</xsl:when>
								<xsl:when test="local-name()='Normal'">Condition</xsl:when>
								<xsl:when test="local-name()='Warning'">Condition</xsl:when>
								<xsl:when test="local-name()='Error'">Condition</xsl:when>
								<xsl:when test="local-name()='Unavailable'">Condition</xsl:when>
								<xsl:otherwise>
									<xsl:value-of select="local-name()" />
								</xsl:otherwise>
							</xsl:choose>
						</xsl:variable>

						<!-- get value -->
						<xsl:variable name="value">
							<xsl:choose>
								<xsl:when test="local-name()='Normal'">NORMAL</xsl:when>
								<xsl:when test="local-name()='Warning'">WARNING</xsl:when>
								<xsl:when test="local-name()='Error'">ERROR</xsl:when>
								<!-- ....put back to UNAVAILABLE -->
								<xsl:when test="local-name()='Unavailable'">NORMAL</xsl:when>
								<xsl:otherwise>
									<xsl:value-of select="text()" />
								</xsl:otherwise>
							</xsl:choose>
						</xsl:variable>

						<!-- get value color -->
						<xsl:variable name="valueColor">
							<!-- <xsl:choose> -->
							<!-- <xsl:when test="local-name()='Condition'"> -->
							<xsl:choose>
								<xsl:when test="$value='NORMAL'">#9fe473</xsl:when>
								<xsl:otherwise>white</xsl:otherwise>
							</xsl:choose>
							<!-- </xsl:when> -->
							<!-- </xsl:choose> -->
						</xsl:variable>

						<tr>
							<td>
								<!-- indent according to depth and show type, eg Device, DataItem -->
								<span style="color:white">
									<xsl:value-of select="substring('xxxxxxxxxxxx',1,$indent)"/>
								</span>

								<!-- <i class="far fa-plus-square" style="color:#aaa"></i> -->
								<!-- why &nbsp; no work here? -->
								<!-- <span style="color:white">.</span> -->

								<!-- add +/- if item has any child elements -->
								<xsl:choose>
									<xsl:when test="*">
										<i class="far fa-plus-square" style="color:#aaa"></i>
									</xsl:when>
									<xsl:otherwise>
										&#8198;
									</xsl:otherwise>
								</xsl:choose>

								<!-- narrow space - see https://stackoverflow.com/questions/8515365/are-there-other-whitespace-codes-like-nbsp-for-half-spaces-em-spaces-en-space -->
								<!-- <span style="color:white">.</span> -->
								<!-- &#160; -->
								<!-- &#8239; -->
								&#8198;

								<span style="font-weight:{$weight};">
									<!-- <xsl:value-of select="local-name()"/> -->
									<xsl:value-of select="$element" />
								</span>
							</td>

							<td>
								<!-- <i class="fas fa-cogs"></i> -->
								<xsl:value-of select="@dataItemId"/>
							</td>
							<td>
								<xsl:value-of select="@name"/>
							</td>
							<td>
								<!-- replace T with space? -->
								<!-- <xsl:value-of select="@timestamp"/> -->
								<!-- <xsl:value-of select="substring(@timestamp,12)"/> -->
								<xsl:value-of select="translate(@timestamp,'T',' ')"/>
							</td>
							<td>
								<xsl:value-of select="@sequence"/>
							</td>
							<td style="background:{$valueColor};">
								<!-- <xsl:value-of select="text()"/> -->
								<xsl:value-of select="$value"/>
							</td>
						</tr>
					</xsl:for-each>
				</tbody>
			</table>
		</div>
	</xsl:template>


</xsl:stylesheet>
