---
title: L’effacement de type en Swift
date: 2017-11-09
description: "En Swift, vous pouvez définir des protocoles en leur associant un ou plusieurs types à l’aide du mot-clé associatedtype. L’appellation « type générique » est ici quelque peu usurpée : il s’agit plutôt d’un emplacement réservé à un type. Nous verrons que ces protocoles offrent peu de souplesse lorsqu’on souhaite les manipuler de manière générique."
tags: astuces
image: images/2017-11-09-TypeErasure/Erase-data.jpg
lang: fr
---

En Swift, vous pouvez définir des protocoles en leur associant un ou plusieurs types à l’aide du mot-clé **associatedtype**. L’appellation « **type générique** » est ici quelque peu usurpée : il s’agit plutôt d’un emplacement réservé à un type. Nous verrons que ces protocoles offrent peu de souplesse lorsqu’on souhaite les manipuler de manière générique.

# Imaginons quelques protocoles

Dans la suite de cet article, nous nous appuierons sur un cas simple : une **Cup** est un type de récipient pouvant accueillir n’importe quel type de **Liquid**. Nous utiliserons évidemment des protocoles pour définir ces deux types.

**Liquid** est un protocole qui expose trois propriétés : une couleur, une viscosité et une température — cette dernière étant modifiable.

```swift
public protocol Liquid {
    var temperature: Float { get set }
    var viscosity: Float { get }
    var color: String { get }
}
```

Cup est un protocole qui déclare le type associé **LiquidType**. Ce type doit respecter le protocole **Liquid** décrit précédemment. Une **Cup** expose une propriété simple de type **LiquidType**, ainsi qu’une fonction permettant de la remplir.

```swift
public protocol Cup {
    associatedtype LiquidType: Liquid
    var liquid: LiquidType? { get }
    func fill (with liquid: LiquidType)
}
```

# Passons à l’implémentation

Tout d’abord, deux types de liquides : **Coffee** et **Milk**.

```swift
struct Coffee: Liquid {
    let viscosity: Float = 3.4
    let color = "black"
    var temperature: Float
}

struct Milk: Liquid {
    let viscosity: Float = 2.2
    let color = "white"
    var temperature: Float
}
```

Puis deux types de tasses : **CeramicCup** et **PlasticCup**. Ces classes sont génériques afin de pouvoir accueillir n’importe quel type de **Liquid**. Elles remplacent le type associé du protocole **Cup** par un type **L**, que nous devons bien sûr contraindre à respecter le protocole **Liquid**, comme l’impose **Cup**.

```swift
class CeramicCup<L: Liquid>: Cup {
    var liquid: L?

    func fill(with liquid: L) {
        self.liquid = liquid
        self.liquid!.temperature -= 1
    }
}

class PlasticCup<L: Liquid>: Cup {
    var liquid: L?

    func fill(with liquid: L) {
        self.liquid = liquid
        self.liquid!.temperature -= 10
    }
}
```

Nous disposons maintenant de deux types concrets de **Cup**, capables d’accueillir n’importe quel type de **Liquid**.

# Le compilateur n’aime pas cela…

Nous serions maintenant tentés d’utiliser nos implémentations ainsi :

![](/images/2017-11-09-TypeErasure/TypeErasure-Error.png)

**Et c’est un échec !** Nous avons tous déjà rencontré ce genre de message inquiétant : « *Protocol ‘xxx’ cannot be used as a generic constraint because it has Self or associatedtype* ».

Il est en réalité impossible d’utiliser **Cup** comme un type générique. Le compilateur ne tolère pas l’inconnue représentée par le type associé au protocole. Ce serait comme résoudre un système de deux inconnues avec une seule équation.

Même si nous tentions d’aider le compilateur en précisant explicitement le type associé, nous serions bloqués, car la notation **Cup&lt;Coffee&gt;** n’est même pas possible.

# … mais les design patterns, si

Les protocoles génériques seront probablement pris en charge un jour, si l’on se réfère au [Generics Manifesto](https://github.com/apple/swift/blob/master/docs/GenericsManifesto.md) publié sur le GitHub de Swift. En attendant, une astuce permet d’arriver à nos fins : le **Type Erasure**, ou effacement de type. Comme son nom l’indique, cette technique permet d’effacer le type associé au protocole et de le rendre générique. Elle peut sembler intimidante au premier abord, car elle n’est pas triviale. Pourtant, il suffit d’appliquer mécaniquement deux design patterns bien connus :

* classe abstraite : [https://en.wikipedia.org/wiki/Template_method_pattern](https://en.wikipedia.org/wiki/Template_method_pattern) ;
* décorateur : [https://en.wikipedia.org/wiki/Decorator_pattern](https://en.wikipedia.org/wiki/Decorator_pattern).

## Une Cup abstraite

Swift ne possède pas de classes abstraites comme Java. Une classe abstraite n’est cependant rien d’autre qu’une implémentation partielle et non instanciable d’un type. Il est donc facile d’écrire une telle implémentation de **Cup**. Nous déclarons une classe générique respectant le protocole — comme **CeramicCup** ou **PlasticCup** — tout en empêchant son utilisation directe grâce aux instructions **fatalError**.

```swift
private class AbstractCup<L: Liquid>: Cup {
    var liquid: L? {
        fatalError("Must implement")
    }

    func fill(with liquid: L) {
        fatalError("Must Implement")
    }
}
```

La première étape de la technique est terminée. Passons à la décoration.

## Une jolie Cup décorée

Si vous avez déjà utilisé **InputStream** en Java, vous avez utilisé le pattern **Decorator** sans forcément vous en rendre compte. C’est lui qui permet à un **FileInputStream** d’être un **InputStream** tout en lui ajoutant de nouvelles fonctionnalités. **FileInputStream** encapsule un **InputStream** classique — reçu en paramètre de son constructeur — et spécialise certains comportements. L’intérêt de ce pattern est de pouvoir imbriquer indéfiniment les décorateurs sans figer l’arbre d’héritage. C’est ainsi qu’un **BufferedInputStream** peut décorer aussi bien un **FileInputStream** qu’un simple **InputStream**.

Mais revenons à nos tasses. Nous allons construire un décorateur qui encapsule une **Cup**. Nous disposons déjà de l’implémentation de base de notre **Cup** avec **AbstractCup** — l’équivalent d’**InputStream** dans l’exemple Java. Nous pouvons donc définir un wrapper, ou décorateur, qui hérite d’**AbstractCup** tout en déléguant les propriétés et les appels de fonctions à la Cup qu’il encapsule.

```swift
final private class CupWrapper<C: Cup>: AbstractCup<C.LiquidType> {
    var cup: C

    public init(with cup: C) {
        self.cup = cup
    }

    override var liquid: C.LiquidType? {
        return self.cup.liquid
    }

    override func fill(with liquid: C.LiquidType) {
        self.cup.fill(with: liquid)
    }
}
```

Remarquons la contrainte imposée aux types **Cup** et **LiquidType**. Nous devons nous assurer que le type de liquide de l’**AbstractCup** décorée est exactement le même que celui de la tasse reçue par le constructeur.

**CupWrapper** est donc à la fois une **Cup** et un wrapper de **Cup**. D’une certaine manière, il permet de transformer une **Cup** — qui n’est qu’un protocole — en type concret. Mais, au bout du compte, c’est bien la **Cup** passée au constructeur qui dictera le comportement du wrapper.

À ce stade, nous disposons déjà d’un résultat utilisable et avons rendu notre protocole exploitable de manière générique :

```swift
var cupsOfCoffee = [AbstractCup<Coffee>]()
cupsOfCoffee.append(CupWrapper(with: CeramicCup<Coffee>()))
cupsOfCoffee.append(CupWrapper(with: PlasticCup<Coffee>()))
```

Nous avons réussi à déclarer un tableau de tasses de café. Le **type associé** a bien été effacé.

# Raffinement

Pour mener le concept de Type Erasure à son terme — et nous rapprocher de son implémentation dans la bibliothèque standard de Swift —, il nous reste une dernière étape. Je vous invite à consulter la documentation officielle d’AnyIterator dans la [bibliothèque standard de Swift](https://developer.apple.com/documentation/swift/anyiterator) pour vous faire une idée de notre objectif final.

Attardons-nous d’abord sur la déclaration des classes **AbstractCup** et **CupWrapper**. Tout a été fait pour qu’elles ne soient ni visibles ni directement modifiables par l’utilisateur de notre modèle — **final** et **private**. L’idée est de masquer autant que possible l’implémentation de notre pattern d’effacement de type et de n’exposer que le mécanisme le plus simple possible.

Nous allons donc fournir une véritable classe générique **AnyCup**, qui sera un simple wrapper de Cup. Il s’agit d’appliquer une seconde fois le pattern Decorator directement sur le protocole Cup, en utilisant en interne CupWrapper pour déléguer le travail :

```swift
final public class AnyCup<L: Liquid>: Cup {
    private let abstractCup: AbstractCup<L>

    public init<C: Cup>(with cup: C) where C.LiquidType == L {
        abstractCup = CupWrapper(with: cup)
    }

    public func fill(with liquid: L) {
        self.abstractCup.fill(with: liquid)
    }

    public var liquid: L? {
        return self.abstractCup.liquid
    }
}
```

Et voilà…

Nous obtenons quelque chose d’assez simple et intuitif à utiliser :

```swift
var coffeeCups = [AnyCup<Coffee>]()
coffeeCups.append(AnyCup<Coffee>(with: CeramicCup<Coffee>()))
coffeeCups.append(AnyCup<Coffee>(with: PlasticCup<Coffee>()))

coffeeCups.forEach { (anyCup) in
    anyCup.fill(with: Coffee(temperature: 60.4))
    print(anyCup.liquid!.color)
    print(anyCup.liquid!.temperature)
}

var milkCups = [AnyCup<Milk>]()
milkCups.append(AnyCup<Milk>(with: CeramicCup<Milk>()))
milkCups.append(AnyCup<Milk>(with: PlasticCup<Milk>()))

milkCups.forEach { (anyCup) in
    anyCup.fill(with: Milk(temperature: 30.9))
    print(anyCup.liquid!.color)
    print(anyCup.liquid!.temperature)
}
```

La ligne de code qui posait problème :

```swift
var cupsOfCoffee = [Cup<Coffee>]()
```

devient :

```swift
var coffeeCups = [AnyCup<Coffee>]()
```

Pari gagné.

Personnellement, j’ai encore aujourd’hui du mal avec ce mécanisme, car il n’est vraiment pas trivial et je dois le relire plusieurs fois pour être certain de bien le comprendre :-) Mais en appliquant suffisamment mécaniquement les étapes que je viens de présenter, on est sûr d’atteindre le résultat attendu — en espérant ne pas devoir l’écrire encore trop longtemps.

Le code est disponible sur mon GitHub : [Playground Type Erasure](https://github.com/twittemb/TypeErasure)

J’espère que cela pourra vous être utile.

# Bonus

Nous pouvons même ajouter une petite fonction utilitaire au protocole **Cup** :

```swift
extension Cup {
    func toAnyCup () -> AnyCup<LiquidType> {
        return AnyCup<LiquidType>(with: self)
    }
}
```

C’est un raccourci agréable, qui s’utilise ainsi :

```swift
var coffeeCups = [AnyCup<Coffee>]()
coffeeCups.append(CeramicCup<Coffee>().toAnyCup())
coffeeCups.append(PlasticCup<Coffee>().toAnyCup())
```

Plutôt sympa :-)

**[Mise à jour du 11 mai 2019]**

Comme j’avais besoin de mettre en place un effacement de type dans l’un de mes projets professionnels, je me suis souvenu d’une solution fondée sur les closures. Je souhaitais la partager ici, car il s’agit d’un pattern très simple et élégant.

Petit rappel des protocoles dont nous devions effacer le type :

```swift
public protocol Liquid {
    var temperature: Float { get set }
    var viscosity: Float { get }
    var color: String { get }
}
```

et :

```swift
public protocol Cup {
    associatedtype LiquidType: Liquid
    var liquid: LiquidType? { get }
    func fill (with liquid: LiquidType)
}
```

Au lieu de créer une classe abstraite, puis un wrapper conservant une référence vers un type conforme à Cup, nous pouvons construire directement une classe wrapper générique qui conservera des références vers les **comportements** de la Cup.

```swift
public class AnyCup<LiquidType: Liquid>: Cup {

    // inner mechanism to "remember" the behavior of the cup
    // passed in the init function
    private let fillClosure: (LiquidType) -> Void
    private let liquidClosure: () -> LiquidType?

    init<CupType: Cup>(with cup: CupType)
    where CupType.LiquidType == LiquidType {
        self.fillClosure = cup.fill
        self.liquidClosure = { return cup.liquid }
    }

    // conformance to Cup protocol
    public var liquid: LiquidType? {
        return self.liquidClosure()
    }

    public func fill(with liquid: LiquidType) {
        self.fillClosure(liquid)
    }
}
```

Vous pouvez considérer cela comme une forme de délégation. Comme nous ne pouvons pas conserver une référence vers une Cup en raison de son type associé, le wrapper conserve des références vers les fonctions et les propriétés de la Cup, puis se charge de leur exécution.

Plutôt simple 👍.
