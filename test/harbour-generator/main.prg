request DBFCDX, HB_CODEPAGE_UTF8EX

proc main()
    HB_CDPSELECT("UTF8EX")

    string()
    varString()
    logicalAndDateTime()
    numeric()
return

proc string()
    local txt
    field simple,long, unicode
    if File("TestString.dbf")
        FErase("TestString.dbf")
    endif
    dbCreate("TestString", {;
        {"SIMPLE","C",30,0}, ;
        {"LONG","C",300,0}, ;
        {"UNICODE","C:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
return

proc varString()
    Local txt
    field simple,long, unicode
    if File("TestVarString.dbf")
        FErase("TestVarString.dbf")
    endif
    dbCreate("TestVarString", {;
        {"SIMPLE","Q",30,0}, ;
        {"LONG","Q",300,0}, ;
        {"UNICODE","Q:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
return

proc logicalAndDateTime()
    local dt
    field logical,date3,date4,date8, time4, time8
    if File("TestLogicalAndDateTime.dbf")
        FErase("TestLogicalAndDateTime.dbf")
    endif
    dbCreate("TestLogicalAndDateTime", {;
        {"logical","L",1,0}, ;
        {"date3","D",3,0}, ;
        {"date4","D",4,0}, ;
        {"date8","D",8,0}, ;
        {"time4","T",4,0}, ;
        {"time8","T",8,0}  ;
    },"DBFCDX",.T.)
    dbAppend()
    field->logical := .T.
    dt := {^ 2020-01-01 12:34:56}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
    dbAppend()
    field->logical := .F.
    dt := {^ 1900-01-01 23:59:59}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
    dbAppend()
    field->logical := .T.
    dt := {^ 2345-12-31 00:00:00}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
return

proc numeric()
    field numeric, numDec
    field Int1, Int2, Int3, Int4, Int8
    field Dec1, Dec2, Dec3, Dec4, Dec8
    field BinDouble
    if File("TestNumeric.dbf")
        FErase("TestNumeric.dbf")
    endif
    dbCreate("TestNumeric", {;
        {"numeric","N",5,0}, ;
        {"numDec","N",5,2}, ;
        {"Int1","I",1,0}, ;
        {"Int2","I",2,0}, ;
        {"Int3","I",3,0}, ;
        {"Int4","I",4,0}, ;
        {"Int8","I",8,0}, ;
        {"Dec1","I",1,2}, ;
        {"Dec2","I",2,2}, ;
        {"Dec3","I",3,2}, ;
        {"Dec4","I",4,2}, ;
        {"Dec8","I",8,2}, ;
        {"BinDouble","B",30,0} ;
    },"DBFCDX",.T.)
    dbAppend()
    field->numeric  := 1
    field->numDec   := 1
    field->Int1 := 1
    field->Int2 := 1
    field->Int3 := 1
    field->Int4 := 1
    field->Int8 := 1
    field->Dec1 := 1
    field->Dec2 := 1
    field->Dec3 := 1
    field->Dec4 := 1
    field->Dec8 := 1
    field->BinDouble := 1
    dbAppend()
    field->numeric  := 3.14
    field->numDec   := 3.14
    field->Int1 := 3.14
    field->Int2 := 3.14
    field->Int3 := 3.14
    field->Int4 := 3.14
    field->Int8 := 3.14
    field->Dec1 := 1.27
    field->Dec2 := 3.14
    field->Dec3 := 3.14
    field->Dec4 := 3.14
    field->Dec8 := 3.14
    field->BinDouble := 3.14
    dbAppend()
    field->numeric  := -2
    field->numDec   := -2.71
    field->Int1 := -2
    field->Int2 := -2
    field->Int3 := -2
    field->Int4 := -2
    field->Int8 := -2
    field->Dec1 := -1.28
    field->Dec2 := -2.71
    field->Dec3 := -2.71
    field->Dec4 := -2.71
    field->Dec8 := -2.71
    field->BinDouble := -2.71
return

