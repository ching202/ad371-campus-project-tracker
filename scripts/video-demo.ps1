# Run from Windows PowerShell or PowerShell 7. No host Node.js is required.
# -Auto skips the speaking pauses so this same demonstration can be checked.
param([switch]$Auto)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(20)
$base = 'http://localhost:3000'
$demoStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$createdUrls = [System.Collections.Generic.List[string]]::new()

function Step([string]$Title) {
    Write-Host "`n========== $Title ==========" -ForegroundColor Cyan
    if (-not $Auto) { [void](Read-Host 'Explain the previous result, then press Enter to run this step') }
}

function Api([string]$Method, [string]$Path, $Body = $null, [int]$Expected = 200) {
    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method), "$base$Path"
    )
    $response = $null
    try {
        if ($null -ne $Body) {
            $json = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
            $request.Content = [System.Net.Http.StringContent]::new(
                $json, [System.Text.Encoding]::UTF8, 'application/json'
            )
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $status = [int]$response.StatusCode
        Write-Host "$Method $Path -> HTTP $status"
        if ($status -ne $Expected) { throw "Expected HTTP $Expected, received ${status}: $text" }
        if ($text) { return ($text | ConvertFrom-Json) }
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

function Json($Value) { Write-Host (ConvertTo-Json -InputObject $Value -Depth 8) }

function Sql([string]$Query, [string]$ExpectedPattern = '', [switch]$ExpectForeignKeyError) {
    Write-Host "psql> $Query" -ForegroundColor DarkCyan
    # Capture an intentional native stderr error without stopping PowerShell 5.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $result = @($Query | docker compose exec -T postgres psql -X -U campus -d campus_tracker -P pager=off -v ON_ERROR_STOP=1 -v VERBOSITY=verbose 2>&1)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    $display = ($result | ForEach-Object { $_.ToString() }) -join "`n"
    Write-Host $display
    if ($ExpectForeignKeyError) {
        if ($code -eq 0 -or $display -notmatch '23503') { throw 'Expected PostgreSQL foreign-key error 23503.' }
        Write-Host 'PASS: the database rejected the orphan task.' -ForegroundColor Green
    } elseif ($code -ne 0) { throw "psql exited with code $code." }
    if ($ExpectedPattern -and $display -notmatch $ExpectedPattern) { throw 'The SQL result did not match the expected state.' }
}

function Mongo([string]$Query) {
    Write-Host "mongosh> $Query" -ForegroundColor DarkCyan
    docker compose exec -T mongo mongosh --quiet campus_tracker --eval $Query
    if ($LASTEXITCODE -ne 0) { throw 'MongoDB demonstration failed.' }
}

function Remember($Project, [string]$Engine) {
    # Only API-generated UUIDs are used in these direct database inspection queries.
    # Application SQL itself uses driver parameters in src/stores/sql.js.
    $id = ([guid]::Parse($Project.id)).ToString()
    $createdUrls.Add("/api/$Engine/projects/$id")
    return $id
}

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    Write-Host 'AD371 guided live demo: real HTTP requests and database CLI reads.'
    Write-Host 'Each Enter runs one labeled step. Start recording with the architecture/audit files first.'
    $health = Api GET '/health'
    Json $health
    if ($health.databases.sql -ne 'up' -or $health.databases.nosql -ne 'up') { throw 'Both databases must be available.' }

    Step 'SQL 1/4 - create and read (video 1:30)'
    $sqlProject = (Api POST '/api/sql/projects' @{
        title = 'Video: portfolio website'; description = 'AD371 SQL demonstration'
        tasks = @(@{ title = 'Design the homepage'; status = 'todo' })
    } 201).data
    $sqlId = Remember $sqlProject 'sql'
    $sqlPath = "/api/sql/projects/$sqlId"
    $sqlTask = $sqlProject.tasks[0].id
    Json (Api GET $sqlPath)
    $list = Api GET '/api/sql/projects?limit=5'
    Write-Host "Project list: $($list.data.Count) result(s) on this page."
    $join = "SELECT p.title AS project, t.title AS task, t.status FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.id = '$sqlId';"
    Sql $join 'todo'

    Step 'SQL 2/4 - update and reject blank input'
    Api PATCH $sqlPath @{ title = 'Video: portfolio in progress' } | Out-Null
    Api PATCH "$sqlPath/tasks/$sqlTask" @{ status = 'done' } | Out-Null
    Sql $join 'done'
    Json (Api POST "$sqlPath/tasks" @{ title = '   ' } 400)

    Step 'SQL 3/4 - database foreign-key rejection'
    $missingId = [guid]::NewGuid().ToString()
    Sql "INSERT INTO tasks (project_id, title) VALUES ('$missingId', 'Orphan task');" -ExpectForeignKeyError

    Step 'SQL 4/4 - delete parent, prove cascade and 404'
    Json (Api DELETE $sqlPath)
    Sql "SELECT (SELECT count(*) FROM projects WHERE id = '$sqlId') AS projects_remaining, (SELECT count(*) FROM tasks WHERE project_id = '$sqlId') AS tasks_remaining;" '\b0\s+\|\s+0\b'
    Json (Api GET $sqlPath $null 404)

    Step 'MONGO 1/4 - create and read one document (video 3:30)'
    $mongoProject = (Api POST '/api/nosql/projects' @{
        title = 'Video: portfolio website'; description = 'AD371 embedded document demonstration'
        tasks = @(@{ title = 'Design the homepage'; status = 'todo' })
    } 201).data
    $mongoId = Remember $mongoProject 'nosql'
    $mongoPath = "/api/nosql/projects/$mongoId"
    Api GET $mongoPath | Out-Null
    $find = "printjson(db.projects.findOne({ _id: '$mongoId' }));"
    Mongo $find

    Step 'MONGO 2/4 - atomic push and embedded update'
    $addedTask = (Api POST "$mongoPath/tasks" @{ title = 'Test the mobile layout' } 201).data
    Api PATCH "$mongoPath/tasks/$($addedTask.id)" @{ status = 'done' } | Out-Null
    Api PATCH $mongoPath @{ title = 'Video: portfolio in progress' } | Out-Null
    Write-Host 'The store uses $push to append and $set to change the matching task.'
    Mongo $find

    Step 'MONGO 3/4 - prove the AI audit correction'
    $duplicateCheck = @'
const before = db.projects.findOne({ _id: '__PROJECT_ID__' });
try {
  db.projects.updateOne({ _id: before._id }, {
    $push: { tasks: { ...before.tasks[0], title: 'Duplicate task ID test' } }
  });
  throw new Error('Expected duplicate task ID rejection.');
} catch (error) {
  if (error.code !== 121) throw error;
  print('PASS: duplicate embedded task ID rejected by validator (code 121).');
}
const after = db.projects.findOne({ _id: before._id });
if (EJSON.stringify(before) !== EJSON.stringify(after)) throw new Error('Document changed after rejected update.');
print('PASS: rejected write left the document unchanged.');
'@
    Mongo ($duplicateCheck.Replace('__PROJECT_ID__', $mongoId))

    Step 'MONGO 4/4 - delete a task, then the whole document'
    Api DELETE "$mongoPath/tasks/$($addedTask.id)" | Out-Null
    Mongo "const p = db.projects.findOne({ _id: '$mongoId' }); if (p.tasks.length !== 1) throw new Error('Expected one remaining task.'); printjson({ tasks_remaining: p.tasks.length });"
    Json (Api DELETE $mongoPath)
    Mongo "const count = db.projects.countDocuments({ _id: '$mongoId' }); printjson({ documents_remaining: count }); if (count !== 0) throw new Error('Document was not deleted.');"
    Json (Api GET $mongoPath $null 404)

    Step 'QA - health and recent server logs (video 5:15)'
    Json (Api GET '/health')
    $logs = @(docker compose logs --no-color --since $demoStartedAt api)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the API logs.' }
    Write-Host 'Sample parameterized SQL statement from this run:'
    $logs | Select-String '"event":"sql".*\$1' | Select-Object -First 1 | ForEach-Object { Write-Host $_.Line }
    Write-Host 'Recent HTTP and MongoDB commands:'
    $logs | Select-Object -Last 6 | ForEach-Object { Write-Host $_ }
    if ($logs -match '"event":"(unexpected_error|sql_pool_error)"') { throw 'Unexpected server error in this demonstration; inspect the logs.' }
    Write-Host 'No unexpected_error or sql_pool_error events in this run.'
    Write-Host 'PASS: guided live demonstration completed.' -ForegroundColor Green
    Write-Host 'Now show docs/qa-results/README.md and explain the SQL/MongoDB tradeoff.'
} finally {
    # Never clear tables or volumes: remove only records created by this run.
    foreach ($path in $createdUrls) {
        try {
            $cleanup = $client.DeleteAsync("$base$path").GetAwaiter().GetResult()
            try {
                if ([int]$cleanup.StatusCode -notin @(200, 404)) { Write-Warning "Cleanup returned HTTP $([int]$cleanup.StatusCode) for $path" }
            } finally { $cleanup.Dispose() }
        } catch { Write-Warning "Could not clean up ${path}: $($_.Exception.Message)" }
    }
    $client.Dispose()
    Pop-Location
}
