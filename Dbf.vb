Imports System.Globalization
Imports System.IO
Imports System.Text

' Harbour\include\hbdbf.h
Public Class Dbf
    Implements IDisposable
    '
    Structure Header
        Dim bVersion As Byte
        Dim bYear As Byte
        Dim bMonth As Byte
        Dim bDay As Byte
        Dim readerUltimaModifica As Date
        Dim nRecord As UInt32
        Dim uiHeaderLen As UInt16
        Dim uiRecordLen As UInt16
        ' spazio di 2
        Dim bTransaction As Byte    ' 1-transaction begin
        Dim bEncrypted As Byte      ' 1-encrypted table
        ' spazio di 12
        Dim bHasTags As Byte        ' bit filed: 1-production index, 2-memo file in VFP
        Dim bCodePage As Byte       ' non gestito... i nostri dbf hanno codepage 1252
        ' spazio di 2
    End Structure

    Structure ColInfo
        Dim bName As String
        Dim bType As Char
        Dim bReserved1 As UInt32 'offset from record begin in FP
        Dim bLen As Byte
        Dim bDec As Byte
        Dim bFieldFlags As Byte ' 1-system column, 2-nullable, 4-binary
        Dim bCounter As UInt32 ' auto-increment counter
        Dim bStep As Byte ' auto-increment Step
        ' spazio di 7
        Dim bHasTag As Byte
        ' calcolati
        Dim iStart As Integer
        Dim format As String
    End Structure

    Dim info As New Header
    Dim columns As ColInfo()
    Dim totalRowLen As Integer
    Dim currRow As String
    Dim currValues As Object()
    Dim fileObj As FileStream
    Dim reader As BinaryReader
    Dim _recNo As UInt32
    Dim _eof As Boolean, _bof As Boolean

    Dim encoder As Encoding
    Dim fileWrite As FileStream

    Public Sub New(fileName As String)
        ' legge da disco
        fileObj = New FileStream(fileName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)
        encoder = Encoding.GetEncoding(1252)
        reader = New BinaryReader(fileObj, encoder)
        UpdateHeader()
        fileObj.Seek(info.uiHeaderLen, SeekOrigin.Begin)
        dbGoTo(1)
        disposedValue = False
    End Sub

    Private Sub UpdateHeader()
        fileObj.Seek(0, SeekOrigin.Begin)
        info.bVersion = reader.ReadByte()
        info.bYear = reader.ReadByte()
        info.bMonth = reader.ReadByte()
        info.bDay = reader.ReadByte()
        info.readerUltimaModifica = New Date(1900 + info.bYear, info.bMonth, info.bDay)
        info.nRecord = reader.ReadUInt32()
        info.uiHeaderLen = reader.ReadUInt16()
        info.uiRecordLen = reader.ReadUInt16()
        fileObj.Seek(2, SeekOrigin.Current) ' spazio di 2
        info.bTransaction = reader.ReadByte()
        info.bEncrypted = reader.ReadByte()
        fileObj.Seek(12, SeekOrigin.Current) ' spazio di 12
        info.bHasTags = reader.ReadByte()
        info.bCodePage = reader.ReadByte()
        fileObj.Seek(2, SeekOrigin.Current) ' spazio di 2
        ReDim columns((info.uiHeaderLen >> 5) - 2)
        ReDim currValues(columns.Length - 1)
        totalRowLen = 1
        For colId As Integer = 0 To columns.Length - 1
            Dim col As ColInfo = columns(colId)
            col.bName = New String(reader.ReadChars(11)).Trim(vbNullChar(0))
            col.bType = reader.ReadChars(1)(0)
            col.bReserved1 = reader.ReadUInt32()
            col.iStart = totalRowLen
            col.bLen = reader.ReadByte()
            totalRowLen += col.bLen
            col.bDec = reader.ReadByte()
            col.bFieldFlags = reader.ReadByte()
            col.bCounter = reader.ReadUInt32()
            col.bStep = reader.ReadByte()
            fileObj.Seek(7, SeekOrigin.Current) ' spazio di 7
            col.bHasTag = reader.ReadByte()
            Select Case col.bType
                Case "N"c
                    col.format = "{0," & col.bLen & ":0"
                    If (col.bDec <> 0) Then
                        col.format &= "."
                        col.format &= New String("0"c, col.bDec)
                    End If
                    col.format &= "}"
            End Select

            columns(colId) = col
        Next
    End Sub

    Public Function dbGoTo(recno As UInt32) As Boolean
        _bof = False
        _eof = False
        If recno < 1 Then
            _recNo = 0
            _bof = True
            Return False
        End If
        If recno > info.nRecord Then
            _recNo = CUInt(info.nRecord + 1)
            _eof = True
            Return False
        End If
        fileObj.Seek(info.uiHeaderLen + info.uiRecordLen * (recno - 1), SeekOrigin.Begin)
        If fileWrite IsNot Nothing Then
            fileWrite.Seek(info.uiHeaderLen + info.uiRecordLen * (recno - 1), SeekOrigin.Begin)
        End If
        Me._recNo = recno
        ReadValues()
        Return True
    End Function

    Public Function dbSkip(Optional delta As Integer = 1) As Boolean
        dbGoTo(CUInt(_recNo + delta))
        Return Not _eof
    End Function

    Private Sub ReadValues()
        currRow = New String(reader.ReadChars(totalRowLen))
        For idx As Integer = 0 To columns.Length - 1
            Dim col As ColInfo = columns(idx)
            Dim readed As String = currRow.Substring(col.iStart, col.bLen)
            Select Case col.bType
                Case "C"c
                    currValues(idx) = readed
                Case "N"c
                    Dim tmp As Double
                    If Double.TryParse(readed, provider:=CultureInfo.InvariantCulture, result:=tmp, style:=NumberStyles.Any) Then
                        currValues(idx) = tmp
                    Else
                        If readed.Trim().Length = 0 OrElse readed.Trim(Chr(0)).Length = 0 Then
                            currValues(idx) = 0
                        Else
                            currValues(idx) = Double.NaN
                        End If
                    End If
                Case "D"c
                    Dim tmp As New Date
                    Date.TryParseExact(readed, format:="yyyyMMdd", result:=tmp, provider:=Nothing, style:=Nothing)
                    currValues(idx) = tmp
                Case "T"c ' time - non usato in TLPosWin
                    If (col.bFieldFlags And 4) = 0 Then
                        Throw New Exception("da fare")
                    End If
                    fileObj.Seek(-col.bLen, SeekOrigin.Current)
                    Dim msec As UInt32 = reader.ReadUInt32
                    Dim dateTime As New Date()
                    currValues(idx) = dateTime.AddMilliseconds(msec)
                Case "@"c ' datetime - non usato in TLPosWin
                    fileObj.Seek(-col.bLen, SeekOrigin.Current)
                    Dim days As Int32 = reader.ReadInt32
                    Dim msec As UInt32 = reader.ReadUInt32
                    Dim dateTime As New Date
                    If days > 0 Then
                        dateTime = #01-01-0001#.AddDays(days)
                    End If
                    If msec > 0 Then
                        dateTime = dateTime.AddMilliseconds(msec)
                    End If
                    currValues(idx) = dateTime
                Case "L"c
                    currValues(idx) = readed(0) = "T"c
                Case Else
                    Throw New NotImplementedException("tipo " & col.bType)
            End Select
        Next
    End Sub

    Public Function FieldPos(fieldName As String) As Integer
        fieldName = fieldName.ToUpper
        Dim idx As Integer = Array.FindIndex(columns, Function(v As ColInfo)
                                                          Return v.bName = fieldName
                                                      End Function)
        Return idx + 1
    End Function

    Default Public ReadOnly Property Item(idx As Integer) As Object
        Get
            If (idx < 1) Then Throw New Exception("invalid index")
            If (idx > columns.Length) Then Throw New Exception("invalid index")
            Return currValues(idx - 1)
        End Get
    End Property

    Public Function FieldGet(Of T)(fieldName As String) As T
        fieldName = fieldName.ToUpper
        Dim idx As Integer = Array.FindIndex(columns, Function(v As ColInfo)
                                                          Return v.bName = fieldName
                                                      End Function)
        If (idx = -1) Then Throw New Exception("field not found")
        Return CType(currValues(idx), T)
    End Function

    Public Function FieldGet(Of T)(idx As Integer) As T
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        Return CType(currValues(idx - 1), T)
    End Function

    Public ReadOnly Property eof As Boolean
        Get
            Return _eof
        End Get
    End Property

    Public ReadOnly Property recNo As UInt32
        Get
            Return _recNo
        End Get
    End Property

    Public ReadOnly Property recCount As UInt32
        Get
            Return info.nRecord
        End Get
    End Property

    Public ReadOnly Property FCount As Integer
        Get
            Return columns.Length
        End Get
    End Property

    Public ReadOnly Property deleted As Boolean
        Get
            Return currRow(0) = "*"c
        End Get
    End Property

    Public ReadOnly Property ultimaModifica As Date
        Get
            Return info.readerUltimaModifica
        End Get
    End Property

    Public Function FieldName(idx As Integer) As String
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        Return columns(idx - 1).bName
    End Function

    Public Function FieldType(idx As Integer) As System.Type
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        Select Case columns(idx - 1).bType
            Case "C"c
                Return GetType(String)
            Case "N"c
                Return GetType(Double)
            Case "D"c
                Return GetType(Date)
            Case "T"c ' time - non usato in TLPosWin
                Return GetType(DateTime)
            Case "@"c ' datetime - non usato in TLPosWin
                Return GetType(DateTime)
            Case "L"c
                Return GetType(Boolean)
            Case Else
                Throw New Exception("da fare")
        End Select
    End Function

    Public Function FieldSize(idx As Integer) As Byte
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        Return columns(idx - 1).bLen
    End Function

    Friend Function FieldDeci(idx As Integer) As Byte
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        Return columns(idx - 1).bDec
    End Function

    Public Sub lock()
        If fileWrite IsNot Nothing Then
            Throw New Exception("already locked")
            Return
        End If
        fileWrite = New FileStream(fileObj.Name, FileMode.Open, FileAccess.Write, FileShare.Read)
        dbGoTo(_recNo)
    End Sub

    Public Sub unlock()
        If fileWrite Is Nothing Then
            Throw New Exception("not locked")
            Return
        End If
        fileWrite.Close()
    End Sub

    Public Sub FieldSet(fieldName As String, val As Object)
        fieldName = fieldName.ToUpper
        Dim idx As Integer = Array.FindIndex(columns, Function(v As ColInfo)
                                                          Return v.bName = fieldName
                                                      End Function)
        If (idx = -1) Then Throw New Exception("field not found")
        FieldSet(idx + 1, val)
    End Sub

    Public Sub FieldSet(idx As Integer, val As Object)
        If (idx < 1) Then Throw New Exception("invalid index")
        If (idx > columns.Length) Then Throw New Exception("invalid index")
        idx -= 1
        Select Case columns(idx).bType
            Case "C"c
                currValues(idx) = CType(val, String)
            Case "N"c
                currValues(idx) = CDbl(val)
            Case "D"c
                currValues(idx) = CDate(val)
            Case "T"c ' time - non usato in TLPosWin
                Dim tmp As DateTime = CType(val, DateTime)
                tmp = New DateTime(tmp.Ticks - tmp.Date.Ticks)
                currValues(idx) = tmp
            Case "@"c ' datetime - non usato in TLPosWin
                currValues(idx) = CType(val, DateTime)
            Case "L"c
                currValues(idx) = CBool(val)
            Case Else
                Throw New NotImplementedException("tipo " & columns(idx).bType)
        End Select
    End Sub

    Public Sub WriteValues()
        If fileWrite Is Nothing Then
            Throw New Exception("not locked")
            Return
        End If
        Dim newRow As New List(Of Byte)
        newRow.Add(Asc(" "c)) 'non cancellato
        For idx As Integer = 0 To columns.Length - 1
            Dim col As ColInfo = columns(idx)

            If newRow.Count <> col.iStart Then
                Throw New Exception("errore")
            End If

            Select Case col.bType
                Case "C"c
                    currValues(idx) = currValues(idx).ToString.PadRight(col.bLen).Substring(0, col.bLen)
                    newRow.AddRange(encoder.GetBytes(CStr(currValues(idx))))
                Case "N"c
                    Dim tmp As String = String.Format(col.format, currValues(idx)).Replace(","c, "."c)
                    tmp = tmp.PadRight(col.bLen).Substring(0, col.bLen)
                    newRow.AddRange(encoder.GetBytes(tmp))
                Case "D"c
                    newRow.AddRange(encoder.GetBytes(String.Format("{0:yyyyMMdd}", currValues(idx))))
                Case "T"c ' time - non usato in TLPosWin
                    If (col.bFieldFlags And 4) = 0 Then
                        Throw New Exception("da fare")
                    End If
                    Dim val As DateTime = CType(currValues(idx), DateTime)
                    Dim msec As UInt32 = Convert.ToUInt32(val.TimeOfDay.TotalMilliseconds)
                    newRow.AddRange(BitConverter.GetBytes(msec))
                Case "@"c ' datetime - non usato in TLPosWin
                    fileObj.Seek(-col.bLen, SeekOrigin.Current)
                    Dim val As DateTime = (CType(currValues(idx), DateTime))
                    Dim days As Int32 = CInt(Math.Floor(val.Subtract(#01-01-0001#).TotalDays))
                    Dim msec As UInt32 = CUInt(val.TimeOfDay.TotalMilliseconds)
                    newRow.AddRange(BitConverter.GetBytes(days))
                    newRow.AddRange(BitConverter.GetBytes(msec))
                Case "L"c
                    newRow.Add(CByte(Asc(CChar(IIf(CBool(currValues(idx)), "T"c, "F"c)))))
                Case Else
                    Throw New NotImplementedException("tipo " & col.bType)
            End Select
        Next
        If newRow.Count <> totalRowLen Then
            Throw New Exception("errore")
        End If
        fileWrite.Write(newRow.ToArray, 0, totalRowLen)
    End Sub

    Public Sub Append()
        If fileWrite Is Nothing Then
            Throw New Exception("not locked")
            Return
        End If
        fileWrite.Close()
        fileWrite = New FileStream(fileObj.Name, FileMode.Open, FileAccess.Write, FileShare.Read)
        fileWrite.Seek(4, SeekOrigin.Begin)
        info.nRecord += CUInt(1)
        fileWrite.Write(BitConverter.GetBytes(info.nRecord), 0, 4)
        fileWrite.Close()
        fileWrite = New FileStream(fileObj.Name, FileMode.Append, FileAccess.Write, FileShare.Read)
        'fileWrite.Seek(info.uiHeaderLen + info.uiRecordLen * (info.nRecord - 1), SeekOrigin.Begin)
        Dim emptyLine As Byte()
        ReDim emptyLine(info.uiRecordLen)
        For i As Integer = 0 To emptyLine.Length - 1
            emptyLine(i) = 0
        Next
        fileWrite.Write(emptyLine, 0, info.uiRecordLen)
        fileWrite.Close()
        fileWrite = New FileStream(fileObj.Name, FileMode.Open, FileAccess.Write, FileShare.Read)
        dbGoTo(info.nRecord)
    End Sub

#Region "IDisposable Support"
    Private disposedValue As Boolean = False ' Per rilevare chiamate ridondanti

    ' IDisposable
    Protected Overridable Sub Dispose(disposing As Boolean)
        If Not disposedValue Then
            If disposing Then
                reader.Close()
                fileObj.Close()
                If fileWrite IsNot Nothing Then
                    ' error?
                    fileWrite.Close()
                End If
            End If
        End If
        disposedValue = True
    End Sub

    Public Sub Dispose() Implements IDisposable.Dispose
        Dispose(True)
    End Sub
#End Region
End Class
