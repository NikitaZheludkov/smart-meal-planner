# per 100 g/ml: (kcal,P,F,C)
N={'egg':(78,6.3,5.3,0.4),'farsh':(250,17,20,0),'cheese':(360,25,28,0),'plav':(65,3,4.5,1.5),'mayo':(620,.5,67,2.6),
'ketchup':(100,1.5,.5,23),'mustard':(66,6,4,6),'tomato':(20,1,.2,4),'cucumber':(15,.8,.1,2.8),'onion':(41,1.4,0,10),
'pepper':(27,1.3,.1,5.3),'thigh':(200,17,14,0),'cream10':(118,3,10,4.5),'bacon':(500,13,50,0),'pasta':(350,12,1.5,71),
'ham':(260,12,23,2),'brd':(250,9,3,45),'picl':(15,.8,.1,2.5),'dough':(360,6,22,36),'kraut':(19,.9,.1,4.4),
'crab':(95,6,1,13),'nutsauce':(450,4,40,15),'chuka':(100,2,4,14),'avocado':(160,2,15,9),'pesto':(460,5,45,6),
'tuna':(115,25,1.5,0),'potato':(77,2,.4,16),'soy':(60,8,0,6),'cumin':(375,18,22,44),'cilantro':(23,2,.5,3.7)}
def a(k,g): return tuple(v*g/100 for v in N[k])
D={
'Бедро куриное (лук)':(2,[a('cilantro',5),a('thigh',500),a('onion',300),a('soy',30)]),
'Глазунья':(1,[a('cucumber',60),a('tomato',60),a('ham',100),a('brd',35),a('egg',110)]),
'Драники':(2,[a('potato',600),a('onion',300)]),
'Закрытый бургер':(2,[a('mustard',20),a('ketchup',20),a('onion',25),a('mayo',20),a('picl',30),a('tomato',30),a('plav',4*20),a('cheese',40),a('dough',450),a('farsh',1000)]),
'Капуста квашеная':(1,[a('kraut',150)]),
'Карбонара':(2,[a('bacon',200),a('pasta',180),a('cream10',100),a('cheese',100),a('egg',55)]),
'Люля кебаб':(2,[a('cumin',5),a('cilantro',5),a('onion',300),a('pepper',300),a('farsh',500)]),
'Овощной салат':(1,[a('cucumber',90),a('pepper',112),a('tomato',90)]),
'Салат чукка':(1,[a('crab',50),a('nutsauce',20),a('chuka',100)]),
'Тост с тунцом':(2,[a('avocado',100),a('onion',25),a('mayo',30),a('picl',20),a('pesto',20),a('tuna',130),a('brd',70)]),
}
for n,(y,l) in D.items():
    t=[sum(x[i] for x in l)/y for i in range(4)]
    print(f"'{n}': {{ kcal: {round(t[0])}, protein: {round(t[1])}, fat: {round(t[2])}, carbs: {round(t[3])} }},")
import sqlite3
c=sqlite3.connect('/opt/pocketbase/pb_data/data.db')
b=sqlite3.connect('/opt/pocketbase/pb_data/data.db.bak-before-kbju'); c.backup(b); b.close()
with c:
    for n,(y,l) in D.items():
        t=[round(sum(x[i] for x in l)/y) for i in range(4)]
        cur=c.execute("update dishes set kcal=?,protein=?,fat=?,carbs=? where household='nrauz88c7t9550m' and trim(name)=? and kcal=0",(*t,n))
        print(n,cur.rowcount)
